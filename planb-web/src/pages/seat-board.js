/**
 * 桌位分配看板。
 *
 * 左：按公司分组的参会人名册；右：桌位卡片。把左侧人员拖到桌位上即可分配，
 * 也可以「点人 → 点桌位」。点保存时提交「最终状态」并带上打开时的版本号，
 * 版本号对不上说明别的管理员改过，后端会拒绝，这里提示重新加载。
 *
 * 自带 DOM 覆盖层，不参与 AdminView 的整页重绘，避免拖拽过程中被 render 打断。
 * 桌位容量本期不启用（后端字段预留），所以只显示人数、不做超员校验。
 */

import { html, when } from '../core/dom.js';

const UNGROUPED = '未填写公司';

/** 前端构建标记：显示在看板右上角，便于确认浏览器加载的是哪一版资源 */
export const BOARD_VERSION = '2026-09-30.4';

function phoneTail(phone) {
  return phone && phone.length >= 4 ? phone.slice(-4) : (phone || '');
}

export class SeatBoardModal {
  /**
   * @param {object} options
   * @param {(path:string, method:string, data:object, options:object) => Promise<any>} options.adminRequest
   * @param {string} options.city 场次
   * @param {(city:string) => void} options.onSaved 保存成功后的回调（用于刷新后台统计）
   */
  constructor({ adminRequest, city, onSaved }) {
    this.adminRequest = adminRequest;
    this.city = city;
    this.onSaved = onSaved || (() => {});

    this.root = null;
    this.people = [];
    this.tables = [];
    this.baseline = null;
    this.revision = 0;
    this.summary = { tableCount: 0, peopleCount: 0, assigned: 0, unassigned: 0 };
    this.orphanCount = 0;
    this.guestVisible = true;
    this.updatedByName = '';
    this.updatedAt = '';

    this.expanded = new Set();
    this.search = '';
    this.onlyUnassigned = false;
    this.showCompany = false;
    this.selectedPhone = '';
    this.undoStack = [];
    this.redoStack = [];
    this.loading = false;
    this.saving = false;
    this.drag = null;
    this.suppressClick = false;
    this.onKeydown = (event) => {
      if (event.key === 'Escape' && !this.saving) this.requestClose();
    };
  }

  /* ---------- 生命周期 ---------- */

  mount() {
    this.root = document.createElement('div');
    this.root.className = 'sb-mask';
    this.root.innerHTML = String(this.shell());
    document.body.appendChild(this.root);
    document.body.classList.add('sb-open');
    document.addEventListener('keydown', this.onKeydown);

    this.leftEl = this.root.querySelector('.sb-left-body');
    this.rightEl = this.root.querySelector('.sb-tables');
    this.statsEl = this.root.querySelector('.sb-stats');
    this.noteEl = this.root.querySelector('.sb-note');
    this.bindEvents();
    return this.load();
  }

  destroy() {
    if (this.drag && this.drag.ghost) this.drag.ghost.remove();
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    document.removeEventListener('keydown', this.onKeydown);
    if (this.onPointerUp) {
      window.removeEventListener('pointerup', this.onPointerUp);
      window.removeEventListener('pointercancel', this.onPointerUp);
    }
    if (this.timers) { this.timers.forEach((timer) => clearTimeout(timer)); this.timers.clear(); }
    document.body.classList.remove('sb-open');
    this.root = null;
  }

  shell() {
    return html`
      <div class="sb-modal" role="dialog" aria-modal="true">
        <header class="sb-head">
          <div class="sb-title">桌位分配 · <span class="sb-city">${this.city}</span>场</div>
          <div class="sb-stats"></div>
          <div class="sb-tools">
            <button type="button" class="sb-btn" data-act="undo">撤销</button>
            <button type="button" class="sb-btn" data-act="redo">重做</button>
            <button type="button" class="sb-btn primary" data-act="save">保存</button>
            <button type="button" class="sb-btn ghost" data-act="close">关闭</button>
          </div>
        </header>
        <div class="sb-body">
          <section class="sb-left">
            <div class="sb-left-tools">
              <input type="search" class="sb-search" placeholder="搜索姓名 / 公司 / 手机号" />
              <label class="sb-toggle"><input type="checkbox" class="sb-only-unassigned" />只看未分配</label>
            </div>
            <div class="sb-left-body"><div class="sb-empty">正在加载 ···</div></div>
          </section>
          <section class="sb-right">
            <div class="sb-right-tools">
              <button type="button" class="sb-btn small" data-act="add-table">+ 新增桌位</button>
              <label class="sb-toggle sb-toggle-inline"><input type="checkbox" class="sb-show-company" />显示公司</label>
              <span class="sb-hint">把左侧人员拖到桌位上，或点人选桌</span>
            </div>
            <div class="sb-tables"></div>
          </section>
        </div>
        <div class="sb-note"></div>
      </div>
    `;
  }

  /* ---------- 数据 ---------- */

  load() {
    this.loading = true;
    return this.adminRequest(`/api/admin/seats/board?city=${encodeURIComponent(this.city)}`, 'GET', {}, { silent: true })
      .then((data) => {
        this.loading = false;
        this.revision = data.revision || 0;
        this.orphanCount = data.orphanCount || 0;
        this.guestVisible = data.guestVisible !== false;
        this.updatedByName = data.updatedByName || '';
        this.updatedAt = data.updatedAt || '';
        this.tables = (data.tables || []).map((row) => ({ tableNo: row.tableNo, sortNo: row.sortNo || 0 }));
        this.people = (data.people || []).map((row) => ({ ...row, tableNo: row.tableNo || null }));
        this.summary = data.summary || this.summary;
        this.baseline = this.snapshot();
        this.undoStack = [];
        this.redoStack = [];
        this.selectedPhone = '';
        this.expanded = new Set(this.companies().slice(0, 4));
        this.renderAll();
      })
      .catch((err) => {
        this.loading = false;
        this.leftEl.innerHTML = String(html`<div class="sb-empty">${(err && err.message) || '加载失败'}</div>`);
      });
  }

  snapshot() {
    const tableNoByPhone = {};
    this.people.forEach((person) => { if (person.tableNo) tableNoByPhone[person.phone] = person.tableNo; });
    return { tables: this.tables.map((table) => ({ ...table })), tableNoByPhone };
  }

  restore(snapshot) {
    const phones = new Set(Object.keys(snapshot.tableNoByPhone));
    this.people.forEach((person) => {
      person.tableNo = phones.has(person.phone) ? snapshot.tableNoByPhone[person.phone] : null;
    });
    this.tables = snapshot.tables.map((table) => ({ ...table }));
  }

  pushUndo() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  undoOnce() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    this.renderAll();
  }

  redoOnce() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    this.renderAll();
  }

  isDirty() {
    if (!this.baseline) return false;
    const now = this.snapshot();
    if (now.tables.length !== this.baseline.tables.length) return true;
    for (const table of now.tables) {
      if (!this.baseline.tables.some((item) => item.tableNo === table.tableNo)) return true;
    }
    const phones = new Set([...Object.keys(now.tableNoByPhone), ...Object.keys(this.baseline.tableNoByPhone)]);
    for (const phone of phones) {
      if ((now.tableNoByPhone[phone] || '') !== (this.baseline.tableNoByPhone[phone] || '')) return true;
    }
    return false;
  }

  /* ---------- 派生数据 ---------- */

  peopleOf(tableNo) {
    return this.people.filter((person) => person.tableNo === tableNo);
  }

  companyOf(person) {
    const company = (person.company || '').trim();
    return company || UNGROUPED;
  }

  companies() {
    const seen = [];
    this.people.forEach((person) => {
      const company = this.companyOf(person);
      if (!seen.includes(company)) seen.push(company);
    });
    return seen.sort((a, b) => (a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b, 'zh')));
  }

  visiblePeople() {
    const keyword = this.search.trim().toLowerCase();
    return this.people.filter((person) => {
      if (this.onlyUnassigned && person.tableNo) return false;
      if (!keyword) return true;
      return [person.name, person.company, person.phone]
        .some((value) => String(value || '').toLowerCase().includes(keyword));
    });
  }

  counts() {
    const assigned = this.people.filter((person) => person.tableNo).length;
    return { assigned, unassigned: this.people.length - assigned, tableCount: this.tables.length };
  }

  personName(phone) {
    const person = this.people.find((item) => item.phone === phone);
    return person ? person.name : phone;
  }

  /* ---------- 渲染 ---------- */

  renderAll() {
    this.applyCompanyMode();
    this.renderStats();
    this.renderNote();
    this.renderLeft();
    this.renderRight();
    this.renderToolbar();
  }

  renderStats() {
    const { assigned, unassigned, tableCount } = this.counts();
    this.statsEl.innerHTML = String(html`
      已分配 <b>${assigned}</b> · 未分配 <b>${unassigned}</b> · 桌数 <b>${tableCount}</b> · 修订 <b>${this.revision}</b>
      <span class="sb-version" title="前端构建标记：刷新后应看到最新版本号">${BOARD_VERSION}</span>
    `);
  }

  renderNote() {
    const parts = [];
    if (!this.guestVisible) {
      parts.push(`<span class="sb-warn">${this.city}场嘉宾端当前不显示桌位图，保存后也不会对外展示（可在后台「安全设置」里打开）。</span>`);
    }
    if (this.orphanCount > 0) {
      parts.push(`<span class="sb-warn">有 ${this.orphanCount} 条桌位记录的手机号对不上本场次已通过的登记，保存时会一并清理。</span>`);
    }
    if (this.updatedByName) {
      parts.push(`<span>上次修改：${this.updatedByName} ${String(this.updatedAt || '').replace('T', ' ')}</span>`);
    }
    this.noteEl.innerHTML = parts.join(' ');
  }

  renderToolbar() {
    const undoBtn = this.root.querySelector('[data-act="undo"]');
    const redoBtn = this.root.querySelector('[data-act="redo"]');
    const saveBtn = this.root.querySelector('[data-act="save"]');
    if (undoBtn) undoBtn.disabled = !this.undoStack.length;
    if (redoBtn) redoBtn.disabled = !this.redoStack.length;
    if (saveBtn) {
      saveBtn.disabled = this.saving;
      saveBtn.textContent = this.saving ? '保存中 ···' : (this.isDirty() ? '保存 *' : '保存');
    }
  }

  /** 分组是否展开：搜索时自动展开命中的分组，否则用户会以为"没搜到" */
  isGroupOpen(company) {
    return this.expanded.has(company) || !!this.search.trim();
  }

  renderLeft() {
    const rows = this.visiblePeople();
    if (this.loading) {
      this.leftEl.innerHTML = '<div class="sb-empty">正在加载 ···</div>';
      return;
    }
    if (!rows.length) {
      this.leftEl.innerHTML = '<div class="sb-empty">没有符合条件的人员</div>';
      return;
    }
    const groups = this.companies()
      .map((company) => ({ company, rows: rows.filter((person) => this.companyOf(person) === company) }))
      .filter((group) => group.rows.length);

    this.leftEl.innerHTML = groups.map((group) => html`
      <div class="sb-group">
        <div class="sb-group-head tap" data-act="toggle-group" data-company="${group.company}">
          <span class="sb-caret">${this.isGroupOpen(group.company) ? '▾' : '▸'}</span>
          <span class="sb-company">${group.company}</span>
          <span class="sb-group-count">${group.rows.length}</span>
        </div>
        ${when(this.isGroupOpen(group.company), html`<div class="sb-group-body">
          ${group.rows.map((person) => html`
            <div class="sb-person${person.tableNo ? '' : ' unassigned'}${person.duplicate ? ' dup' : ''}${this.selectedPhone === person.phone ? ' selected' : ''}"
                 data-phone="${person.phone}">
              <span class="sb-person-name">${person.name}${person.duplicate ? html`<em class="sb-dup-tag">同名</em>` : ''}</span>
              <span class="sb-person-meta">${person.position || person.role || ''}</span>
              <span class="sb-person-phone">${phoneTail(person.phone)}</span>
              <span class="sb-person-table">${person.tableNo || '未分配'}</span>
            </div>
          `)}
        </div>`)}
      </div>
    `).join('');
  }

  /** 「显示公司」时给网格加类：格子更宽、卡片更高（CSS 里定义） */
  applyCompanyMode() {
    if (this.rightEl) this.rightEl.classList.toggle('show-company', this.showCompany);
  }

  renderRight() {
    const tables = this.tables.slice().sort((a, b) => (a.sortNo - b.sortNo) || a.tableNo.localeCompare(b.tableNo, 'zh'));
    this.rightEl.innerHTML = tables.map((table) => {
      const members = this.peopleOf(table.tableNo);
      return html`
        <div class="sb-table${this.dragHighlight === table.tableNo ? ' drop-target' : ''}" data-table-no="${table.tableNo}">
          <div class="sb-table-head">
            <span class="sb-table-no">${table.tableNo}</span>
            <span class="sb-table-count${members.length ? '' : ' empty'}">${members.length} 人</span>
            <button type="button" class="sb-icon" title="改名" data-act="rename-table" data-table-no="${table.tableNo}">改名</button>
            <button type="button" class="sb-icon danger" title="删除桌位" data-act="delete-table" data-table-no="${table.tableNo}">删除</button>
          </div>
          <div class="sb-chips">
            ${members.map((person) => html`
              <span class="sb-chip${person.duplicate ? ' dup' : ''}" data-phone="${person.phone}" title="${this.chipTitle(person)}">
                <span class="sb-chip-body">
                  <span class="sb-chip-name">${person.name}</span>
                  ${when(this.showCompany, html`<span class="sb-chip-company">${person.company || '未填写公司'}</span>`)}
                </span>
                <button type="button" class="sb-chip-x" data-act="unassign" data-phone="${person.phone}" title="移出">×</button>
              </span>
            `)}
            ${when(!members.length, html`<span class="sb-chips-empty">拖动人员到这里</span>`)}
          </div>
        </div>
      `;
    }).join('') || '<div class="sb-empty">还没有桌位，点「新增桌位」开始</div>';
  }

  /**
   * 看板自带的对话框。
   * 不用全局 showModal：它是给手机画布写的，且挂在 #stageLayer（z-index 200），
   * 在手机后台模式下会被看板自身（z-index 300）盖住，点了像没反应。
   */
  dialog({ title, content = '', editable = false, placeholder = '', confirmText = '确定', cancelText = '取消' }) {
    return new Promise((resolve) => {
      const mask = document.createElement('div');
      mask.className = 'sb-dialog-mask';
      mask.innerHTML = String(html`
        <div class="sb-dialog" role="dialog" aria-modal="true">
          <div class="sb-dialog-title">${title}</div>
          ${when(content, html`<div class="sb-dialog-content">${content}</div>`)}
          ${when(editable, html`<input class="sb-dialog-input" type="text" placeholder="${placeholder}" />`)}
          <div class="sb-dialog-actions">
            ${when(cancelText, html`<button type="button" class="sb-btn" data-dialog="cancel">${cancelText}</button>`)}
            <button type="button" class="sb-btn primary" data-dialog="confirm">${confirmText}</button>
          </div>
        </div>
      `);
      this.root.appendChild(mask);
      const input = mask.querySelector('.sb-dialog-input');
      if (input) setTimeout(() => input.focus(), 40);
      const finish = (confirm) => {
        const value = input ? input.value.trim() : '';
        mask.remove();
        document.removeEventListener('keydown', onKey, true);
        resolve({ confirm, content: value });
      };
      function onKey(event) {
        if (event.key === 'Escape') { event.stopPropagation(); finish(false); }
        if (event.key === 'Enter' && !editable) { event.stopPropagation(); finish(true); }
      }
      mask.addEventListener('click', (event) => {
        const act = event.target.closest('[data-dialog]');
        if (act) finish(act.dataset.dialog === 'confirm');
      });
      document.addEventListener('keydown', onKey, true);
    });
  }

  /** 看板内的轻提示（同样不走全局 toast） */
  flash(message) {
    const node = document.createElement('div');
    node.className = 'sb-toast';
    node.textContent = message;
    this.root.appendChild(node);
    this.later(() => node.remove(), 1900);
    return node;
  }

  later(callback, delay) {
    const timer = setTimeout(callback, delay);
    (this.timers || (this.timers = new Set())).add(timer);
    return timer;
  }

  /* ---------- 交互 ---------- */

  bindEvents() {
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('input', (event) => {
      if (event.target.classList.contains('sb-search')) {
        this.search = event.target.value;
        this.renderLeft();
      }
    });
    this.root.addEventListener('change', (event) => {
      if (event.target.classList.contains('sb-only-unassigned')) {
        this.onlyUnassigned = event.target.checked;
        this.renderLeft();
      }
      if (event.target.classList.contains('sb-show-company')) {
        this.showCompany = event.target.checked;
        this.applyCompanyMode();
        this.renderRight();
      }
    });

    this.root.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    this.root.addEventListener('pointermove', (event) => this.onPointerMove(event));
    window.addEventListener('pointerup', this.onPointerUp = (event) => this.endDrag(event));
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  onClick(event) {
    // 刚拖完不当作点击（鼠标松开时会补一个 click）
    if (this.suppressClick) return;
    const chip = event.target.closest('.sb-chip');
    if (chip && !event.target.closest('.sb-chip-x')) {
      this.showMember(chip.dataset.phone);
      return;
    }
    const actionEl = event.target.closest('[data-act]');
    if (actionEl) {
      this.handleAction(actionEl.dataset.act, actionEl);
      return;
    }
    const person = event.target.closest('.sb-person');
    if (person) {
      this.selectedPhone = this.selectedPhone === person.dataset.phone ? '' : person.dataset.phone;
      this.renderLeft();
      return;
    }
    const table = event.target.closest('[data-table-no]');
    if (table && this.selectedPhone) {
      this.assign(this.selectedPhone, table.dataset.tableNo);
      this.selectedPhone = '';
    }
  }

  handleAction(action, el) {
    if (action === 'undo') return this.undoOnce();
    if (action === 'redo') return this.redoOnce();
    if (action === 'save') return this.requestSave();
    if (action === 'close') return this.requestClose();
    if (action === 'add-table') return this.addTable();
    if (action === 'delete-table') return this.deleteTable(el.dataset.tableNo);
    if (action === 'rename-table') return this.renameTable(el.dataset.tableNo);
    if (action === 'unassign') {
      const phone = el.dataset.phone;
      if (phone) this.assign(phone, null);
      return undefined;
    }
    if (action === 'toggle-group') {
      const company = el.dataset.company;
      if (this.expanded.has(company)) this.expanded.delete(company);
      else this.expanded.add(company);
      this.renderLeft();
    }
    return undefined;
  }

  assign(phone, tableNo) {
    const person = this.people.find((item) => item.phone === phone);
    if (!person || (person.tableNo || null) === (tableNo || null)) return;
    this.pushUndo();
    person.tableNo = tableNo || null;
    this.renderAll();
  }

  async addTable() {
    const result = await this.dialog({ title: '新增桌位', content: '输入桌号，例如「23桌」', editable: true, placeholder: '23桌' });
    if (!result.confirm) return;
    this.commitNewTable(result.content);
  }

  commitNewTable(rawName) {
    const tableNo = String(rawName || '').trim();
    if (!tableNo) return;
    if (tableNo.length > 32) { this.flash('桌号最多 32 个字符'); return; }
    if (this.tables.some((table) => table.tableNo === tableNo)) { this.flash('桌号已存在'); return; }
    const maxSort = this.tables.reduce((max, table) => Math.max(max, table.sortNo || 0), 0);
    this.pushUndo();
    this.tables.push({ tableNo, sortNo: maxSort + 1 });
    this.renderAll();
  }

  async deleteTable(tableNo) {
    const members = this.peopleOf(tableNo);
    const content = members.length
      ? `${tableNo} 上还有 ${members.length} 人，删除后他们会退回「未分配」。`
      : `确定删除 ${tableNo} 吗？`;
    const result = await this.dialog({ title: '删除桌位', content, confirmText: '删除' });
    if (!result.confirm) return;
    this.pushUndo();
    members.forEach((person) => { person.tableNo = null; });
    this.tables = this.tables.filter((table) => table.tableNo !== tableNo);
    this.renderAll();
  }

  async renameTable(tableNo) {
    const result = await this.dialog({ title: '修改桌号', content: `当前：${tableNo}`, editable: true, placeholder: tableNo, confirmText: '保存' });
    if (!result.confirm) return;
    const next = String(result.content || '').trim();
    if (!next || next === tableNo) return;
    if (next.length > 32) { this.flash('桌号最多 32 个字符'); return; }
    if (this.tables.some((table) => table.tableNo === next)) { this.flash('桌号已存在'); return; }
    this.pushUndo();
    this.tables = this.tables.map((table) => (table.tableNo === tableNo ? { ...table, tableNo: next } : table));
    this.people.forEach((person) => { if (person.tableNo === tableNo) person.tableNo = next; });
    this.renderAll();
  }

  /** 悬停提示：同名时靠角色与完整手机号区分 */
  chipTitle(person) {
    return [person.name, person.role, person.phone, person.company, person.position]
      .filter(Boolean).join(' · ');
  }

  /** 点成员看详情：同公司又同后四位的同名人员，只靠完整手机号与角色才分得清 */
  showMember(phone) {
    const person = this.people.find((item) => item.phone === phone);
    if (!person) return;
    const lines = [
      '角色：' + (person.role || '—'),
      '手机号：' + (person.phone || '—'),
      '公司：' + (person.company || '未填写'),
      '职位：' + (person.position || '未填写'),
      '桌位：' + (person.tableNo || '未分配'),
    ];
    if (person.role === '同行人' && person.contactPhone) {
      lines.push('所属登记联系人：' + this.personName(person.contactPhone));
    }
    if (person.duplicate) lines.push('提示：本场次有同名人员，请按手机号区分');
    this.dialog({ title: person.name, content: lines.join('\n'), confirmText: '知道了', cancelText: '' });
  }

  /* ---------- 拖拽（Pointer Events，鼠标与触屏同一套） ---------- */

  onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest('button')) return;
    const source = event.target.closest('.sb-chip') || event.target.closest('.sb-person');
    if (!source || !source.dataset.phone) return;
    this.drag = { phone: source.dataset.phone, startX: event.clientX, startY: event.clientY, active: false, ghost: null };
  }

  onPointerMove(event) {
    if (!this.drag) return;
    if (!this.drag.active) {
      if (Math.abs(event.clientX - this.drag.startX) + Math.abs(event.clientY - this.drag.startY) < 6) return;
      this.drag.active = true;
      const ghost = document.createElement('div');
      ghost.className = 'sb-ghost';
      ghost.textContent = this.personName(this.drag.phone);
      document.body.appendChild(ghost);
      this.drag.ghost = ghost;
      this.root.classList.add('dragging');
    }
    const ghost = this.drag.ghost;
    ghost.style.left = `${event.clientX + 10}px`;
    ghost.style.top = `${event.clientY - 12}px`;
    this.highlightTarget(event.clientX, event.clientY);
    event.preventDefault();
  }

  endDrag(event) {
    const drag = this.drag;
    this.drag = null;
    this.suppressClick = false;
    this.dragHighlight = '';
    this.root.classList.remove('dragging');
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    if (!drag.active) return;   // 只是点击，交给 click 处理
    // 拖完紧接着会来一个 click，抑制掉，避免弹出成员详情
    this.suppressClick = true;
    setTimeout(() => { this.suppressClick = false; }, 0);

    const dropTable = this.targetTableAt(event.clientX, event.clientY);
    if (dropTable) {
      this.assign(drag.phone, dropTable);
      return;
    }
    if (this.inLeftPanel(event.clientX, event.clientY)) this.assign(drag.phone, null);
  }

  targetTableAt(x, y) {
    const node = document.elementFromPoint(x, y);
    if (!node) return '';
    const table = node.closest('[data-table-no]');
    if (table && this.root.contains(table)) return table.dataset.tableNo;
    return '';
  }

  inLeftPanel(x, y) {
    const node = document.elementFromPoint(x, y);
    return !!(node && node.closest('.sb-left') && this.root.contains(node.closest('.sb-left')));
  }

  highlightTarget(x, y) {
    const next = this.targetTableAt(x, y);
    if (next === this.dragHighlight) return;
    this.dragHighlight = next;
    this.renderRight();
  }

  /* ---------- 保存 ---------- */

  diff() {
    const baseTables = new Set(this.baseline ? this.baseline.tables.map((table) => table.tableNo) : []);
    const nowTables = new Set(this.tables.map((table) => table.tableNo));
    const baseAssign = this.baseline ? this.baseline.tableNoByPhone : {};
    let moved = 0;
    let assigned = 0;
    let unassigned = 0;
    this.people.forEach((person) => {
      const before = baseAssign[person.phone] || '';
      const after = person.tableNo || '';
      if (before === after) return;
      if (!before && after) assigned += 1;
      else if (before && !after) unassigned += 1;
      else moved += 1;
    });
    return {
      tablesAdded: [...nowTables].filter((no) => !baseTables.has(no)).length,
      tablesRemoved: [...baseTables].filter((no) => !nowTables.has(no)).length,
      moved,
      assigned,
      unassigned,
    };
  }

  async requestSave() {
    if (this.saving) return;
    if (!this.isDirty()) { this.flash('没有需要保存的改动'); return; }
    const change = this.diff();
    const lines = [];
    if (change.tablesAdded) lines.push(`新增 ${change.tablesAdded} 张桌`);
    if (change.tablesRemoved) lines.push(`删除 ${change.tablesRemoved} 张桌（桌上的嘉宾退回未分配）`);
    if (change.assigned) lines.push(`新分配 ${change.assigned} 人`);
    if (change.moved) lines.push(`调整 ${change.moved} 人的桌位`);
    if (change.unassigned) lines.push(`移出 ${change.unassigned} 人`);
    if (this.orphanCount) lines.push(`清理 ${this.orphanCount} 条无对应登记的桌位记录`);

    const result = await this.dialog({
      title: `保存 ${this.city}场桌位`,
      content: `${lines.join('、')}。`,
      confirmText: '确认保存',
    });
    if (!result.confirm) return;
    this.save();
  }

  save() {
    this.saving = true;
    this.renderToolbar();
    const payload = {
      eventCity: this.city,
      revision: this.revision,
      tables: this.tables
        .slice()
        .sort((a, b) => (a.sortNo - b.sortNo))
        .map((table) => ({ tableNo: table.tableNo, sortNo: table.sortNo })),
      assignments: this.people
        .filter((person) => person.tableNo)
        .map((person) => ({ phone: person.phone, tableNo: person.tableNo })),
    };
    return this.adminRequest('/api/admin/seats/board', 'POST', payload)
      .then((data) => {
        this.saving = false;
        this.revision = data.revision || this.revision;
        this.orphanCount = data.orphanCount || 0;
        this.updatedByName = data.updatedByName || this.updatedByName;
        this.updatedAt = data.updatedAt || '';
        this.summary = data.summary || this.summary;
        const change = data.changes || {};
        const kept = this.people.map((person) => ({ ...person }));
        this.baseline = this.snapshot();
        this.people = kept;
        this.undoStack = [];
        this.redoStack = [];
        this.renderAll();
        this.flash('已保存');
        this.onSaved(this.city);
      })
      .catch((err) => {
        this.saving = false;
        this.renderToolbar();
        if (err && err.code === 1003) this.onConflict(err);
      });
  }

  async onConflict(err) {
    const result = await this.dialog({
      title: '该场次已被其他管理员修改',
      content: `${err.message || ''}\n\n重新加载会丢弃你当前的改动。`,
      confirmText: '重新加载',
      cancelText: '保留我的改动',
    });
    if (result.confirm) this.load();
  }

  async requestClose() {
    if (this.saving) return;
    if (this.isDirty()) {
      const result = await this.dialog({
        title: '放弃未保存的改动？',
        content: '关闭后本次分配不会生效。',
        confirmText: '放弃并关闭',
        cancelText: '继续编辑',
      });
      if (!result.confirm) return;
    }
    this.destroy();
  }
}
