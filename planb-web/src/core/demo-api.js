/**
 * 演示后端：用 localStorage 复刻 Spring Boot 接口的返回结构与错误码，
 * 让网页版在没有后端时也能走通完整流程（登记 → 审核 → 抽奖）。
 * 接口路径、字段名、错误码与 backend/ 中的 Controller 保持一致。
 */

import { getStorage, setStorage } from './storage.js';

const DB_KEY = 'demoDb';
const CITIES = ['上海', '济南', '佛山'];
const CITY_CODES = { 上海: 'SH2026', 济南: 'JN2026', 佛山: 'FS2026' };

const EVENT_ROWS = [
  { id: 1, city: '佛山', eventDate: '2026-09-18', tempMin: 23, tempMax: 30, weatherText: '小雨', icon: 'rainy', tip: '请备好雨具，预留抵达时间' },
  { id: 2, city: '济南', eventDate: '2026-09-22', tempMin: 17, tempMax: 28, weatherText: '多云', icon: 'cloudy', tip: '早晚温差明显，建议携带薄外套' },
  { id: 3, city: '上海', eventDate: '2026-10-21', tempMin: null, tempMax: null, weatherText: '', icon: 'cloudy', tip: '' },
];

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  error.message = message;
  return error;
}

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function seedDb() {
  return {
    seq: { application: 0, guest: 0 },
    user: {
      id: 1,
      nickname: '贵宾用户',
      name: '',
      gender: '',
      phone: '',
      phoneCountryCode: '',
      canInvite: true,
      canReview: true,
      createdAt: nowIso(),
    },
    invitations: CITIES.map((city, index) => ({
      id: index + 1,
      code: CITY_CODES[city],
      maxUses: 100,
      usedCount: 0,
      inviterUserId: 1,
      inviterName: '会务团队',
      eventCity: city,
      status: 'ACTIVE',
      createdAt: nowIso(),
    })),
    applications: [],
    seats: [],
    lottery: {},
  };
}

function loadDb() {
  const db = getStorage(DB_KEY);
  if (db && db.invitations && db.user) return db;
  const fresh = seedDb();
  setStorage(DB_KEY, fresh);
  return fresh;
}

function saveDb(db) {
  setStorage(DB_KEY, db);
  return db;
}

function invitationByCode(db, code) {
  const normalized = String(code || '').trim().toUpperCase();
  return db.invitations.find((item) => item.code.toUpperCase() === normalized);
}

function currentApplication(db) {
  return db.applications.find((item) => item.userId === db.user.id) || null;
}

function withEventCity(db, application) {
  if (!application) return application;
  const invitation = invitationByCode(db, application.invitationCode);
  return { ...application, eventCity: invitation ? invitation.eventCity : '' };
}

function buildGuests(db, applicationId, attendees) {
  return (attendees || []).map((guest, index) => {
    db.seq.guest += 1;
    return {
      id: db.seq.guest,
      applicationId,
      guestIndex: index + 1,
      name: String(guest.name || '').trim(),
      company: String(guest.company || '').trim(),
      gender: guest.gender || '男',
      phone: String(guest.phone || '').trim(),
      position: String(guest.position || '').trim(),
      accommodation: guest.accommodation || '无需住宿',
      roomType: guest.roomType || '柏楚预定房型',
      checkinDate: guest.checkinDate || '',
      createdAt: nowIso(),
    };
  });
}

function submitApplication(db, data) {
  const attendees = data.attendees || [];
  if (!attendees.length || attendees.length > 10) throw fail(1000, '同行人员信息不完整');
  if (currentApplication(db)) throw fail(3001, '该手机号已提交过申报，请勿重复提交');

  const invitation = invitationByCode(db, data.invitationCode);
  if (!invitation) throw fail(2001, '邀请码无效');
  if (invitation.usedCount >= invitation.maxUses) throw fail(2002, '该邀请码已达使用上限');

  const primary = attendees[0];
  db.seq.application += 1;
  const application = {
    id: db.seq.application,
    userId: db.user.id,
    invitationCode: invitation.code,
    name: String(primary.name || '').trim(),
    phone: String(primary.phone || '').trim(),
    company: String(primary.company || '').trim(),
    position: String(primary.position || '').trim(),
    reason: String(data.reason || '').trim(),
    status: 'PENDING',
    reviewRemark: '',
    createdAt: nowIso(),
    reviewedAt: null,
    checkedInAt: null,
    editCount: 0,
    attendees: [],
  };
  application.attendees = buildGuests(db, application.id, attendees);
  invitation.usedCount += 1;
  db.applications.push(application);
  saveDb(db);
  return withEventCity(db, application);
}

function resubmitApplication(db, data) {
  const application = currentApplication(db);
  if (!application) throw fail(3002, '未查询到申报记录');
  if ((application.editCount || 0) >= 2) throw fail(1003, '登记信息最多修改两次');

  const attendees = data.attendees || [];
  if (!attendees.length || attendees.length > 10) throw fail(1000, '同行人员信息不完整');

  const requested = String(data.invitationCode || '').trim().toUpperCase();
  const current = String(application.invitationCode || '').toUpperCase();
  if (requested && requested !== current) {
    if (application.status !== 'REJECTED') throw fail(1003, '当前审核状态不允许切换受邀场次');
    const replacement = invitationByCode(db, requested);
    if (!replacement) throw fail(2001, '邀请码无效');
    const previous = invitationByCode(db, current);
    if (previous) previous.usedCount = Math.max(0, previous.usedCount - 1);
    replacement.usedCount += 1;
    application.invitationCode = replacement.code;
  }

  const primary = attendees[0];
  application.name = String(primary.name || '').trim();
  application.phone = String(primary.phone || '').trim();
  application.company = String(primary.company || '').trim();
  application.position = String(primary.position || '').trim();
  application.reason = String(data.reason || '').trim();
  application.status = 'PENDING';
  application.reviewRemark = '';
  application.reviewedAt = null;
  application.editCount = (application.editCount || 0) + 1;
  application.attendees = buildGuests(db, application.id, attendees);
  saveDb(db);
  return withEventCity(db, application);
}

function reviewApplication(db, id, data) {
  const application = db.applications.find((item) => item.id === Number(id));
  if (!application) throw fail(3002, '未查询到申报记录');
  application.status = data.status;
  application.reviewRemark = data.remark || '';
  application.reviewedAt = nowIso();
  saveDb(db);
  return application;
}

const PHONE_PATTERN = /^1\d{10}$/;

function seatsOfCity(db, eventCity) {
  return (db.seats || []).filter((item) => item.eventCity === eventCity);
}

function seatSummary(db, eventCity) {
  const seats = seatsOfCity(db, eventCity);
  return {
    tableCount: new Set(seats.map((item) => item.tableNo)).size,
    guestCount: seats.length,
  };
}

function mySeat(db) {
  const application = currentApplication(db);
  if (!application) throw fail(3002, '未查询到申报记录');
  if (application.status !== 'APPROVED') throw fail(5001, '参会登记审核通过后可查看桌位');

  const invitation = invitationByCode(db, application.invitationCode);
  const eventCity = invitation ? invitation.eventCity : '';
  const citySeats = seatsOfCity(db, eventCity);
  const myPhones = new Set([application.phone, ...(application.attendees || []).map((guest) => guest.phone)]);

  // 只返回本人及同行人的桌号，不下发其他嘉宾信息，也不下发同桌人数
  const mySeats = citySeats
    .filter((seat) => myPhones.has(seat.phone))
    .map((seat) => ({ name: seat.name, tableNo: seat.tableNo }));

  return {
    eventCity,
    published: citySeats.length > 0,
    mySeats,
  };
}

function importSeats(db, data) {
  const eventCity = String(data.eventCity || '').trim();
  if (!eventCity) throw fail(1000, '缺少活动场次');
  const rows = data.rows || [];
  if (!rows.length) throw fail(1000, '没有可导入的桌位数据');
  if (rows.length > 2000) throw fail(1000, '单次最多导入 2000 条');

  if (!db.seats) db.seats = [];
  const replace = String(data.mode || '').toUpperCase() === 'REPLACE';
  if (replace) db.seats = db.seats.filter((item) => item.eventCity !== eventCity);

  const errors = [];
  const batchPhones = new Set();
  let created = 0;
  let updated = 0;

  rows.forEach((row, index) => {
    const line = index + 1;
    const name = String(row.name || '').trim();
    const phone = String(row.phone || '').trim();
    const tableNo = String(row.tableNo || '').trim();

    if (!name || !phone || !tableNo) {
      errors.push({ line, message: '姓名、手机号、桌号不能为空' });
      return;
    }
    if (!PHONE_PATTERN.test(phone)) {
      errors.push({ line, message: '手机号格式不正确' });
      return;
    }
    if (batchPhones.has(phone)) {
      errors.push({ line, message: '同一手机号在本次导入中重复' });
      return;
    }
    batchPhones.add(phone);

    const target = db.seats.find((item) => item.eventCity === eventCity && item.phone === phone);
    if (target) {
      Object.assign(target, { name, tableNo, updatedAt: nowIso() });
      updated += 1;
    } else {
      db.seats.push({
        id: db.seats.length + 1,
        eventCity,
        name,
        phone,
        tableNo,
        remark: '',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      created += 1;
    }
  });

  saveDb(db);
  return {
    eventCity,
    mode: replace ? 'REPLACE' : 'MERGE',
    total: rows.length,
    created,
    updated,
    failed: errors.length,
    errors: errors.slice(0, 20),
    ...seatSummary(db, eventCity),
  };
}

function drawLottery(db) {
  const application = currentApplication(db);
  if (!application || application.status !== 'APPROVED') {
    throw fail(4002, '参会登记审核通过后方可领取抽奖码');
  }
  const existing = db.lottery[db.user.id];
  if (existing) return { luckyCode: existing, newlyDrawn: false };
  const luckyCode = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  db.lottery[db.user.id] = luckyCode;
  saveDb(db);
  return { luckyCode, newlyDrawn: true };
}

/**
 * @param {string} path 形如 /api/apply/me 或 /api/apply/check-invitation?code=X
 * @returns {*} 与后端 Result.data 对应的数据
 */
export function demoRequest(path, method = 'GET', data = {}) {
  const db = loadDb();
  const [pathname, search] = String(path).split('?');
  const query = new URLSearchParams(search || '');
  const segments = pathname.split('/').filter(Boolean);

  if (pathname === '/api/auth/login') {
    return { token: 'demo-token', user: db.user };
  }

  if (pathname === '/api/auth/me') {
    return db.user;
  }

  if (pathname === '/api/auth/phone') {
    db.user.phone = data.phone || db.user.phone || '13800000000';
    db.user.phoneCountryCode = '86';
    saveDb(db);
    return { phone: db.user.phone };
  }

  if (pathname === '/api/auth/profile') {
    db.user.name = String(data.name || '').trim();
    db.user.gender = data.gender || '';
    saveDb(db);
    return db.user;
  }

  if (pathname === '/api/events') {
    return EVENT_ROWS;
  }

  if (pathname === '/api/apply/check-invitation') {
    const invitation = invitationByCode(db, query.get('code'));
    if (!invitation) throw fail(2001, '邀请码无效');
    if (invitation.usedCount >= invitation.maxUses) throw fail(2002, '该邀请码已达使用上限');
    return { valid: true, eventCity: invitation.eventCity, inviterName: invitation.inviterName };
  }

  if (pathname === '/api/apply/me') {
    const application = currentApplication(db);
    if (!application) throw fail(3002, '未查询到申报记录');
    return withEventCity(db, application);
  }

  if (pathname === '/api/apply') {
    if (method === 'POST') return submitApplication(db, data);
    if (method === 'PUT') return resubmitApplication(db, data);
  }

  if (pathname === '/api/lottery/me') {
    const luckyCode = db.lottery[db.user.id];
    if (!luckyCode) throw fail(4001, '尚未抽取号码');
    return { luckyCode, newlyDrawn: false };
  }

  if (pathname === '/api/lottery/draw' && method === 'POST') {
    return drawLottery(db);
  }

  if (pathname === '/api/seat/me') {
    return mySeat(db);
  }

  if (pathname === '/api/invitations/permissions') {
    return { canInvite: !!db.user.canInvite, canReview: !!db.user.canReview };
  }

  if (pathname === '/api/invitations/mine') {
    return db.invitations.map((item) => ({ ...item }));
  }

  if (pathname === '/api/invitations' && method === 'POST') {
    const existing = db.invitations.find((item) => item.eventCity === data.eventCity);
    if (existing) return existing;
    const created = {
      id: db.invitations.length + 1,
      code: CITY_CODES[data.eventCity] || `INV${db.invitations.length + 1}`,
      maxUses: data.maxUses || 100,
      usedCount: 0,
      inviterUserId: db.user.id,
      inviterName: '会务团队',
      eventCity: data.eventCity,
      status: 'ACTIVE',
      createdAt: nowIso(),
    };
    db.invitations.push(created);
    saveDb(db);
    return created;
  }

  if (pathname === '/api/invitations/applications' && method === 'GET') {
    return db.applications.map((item) => ({ ...item }));
  }

  if (segments[1] === 'invitations' && segments[2] === 'applications' && segments[4] === 'review') {
    return reviewApplication(db, segments[3], data);
  }

  if (segments[1] === 'invitations' && segments[3] === 'mini-code') {
    throw fail(9001, '网页版无法生成小程序码');
  }

  if (pathname === '/api/admin/applications' && method === 'GET') {
    const status = query.get('status') || '';
    const page = Number(query.get('page') || 1);
    const size = Number(query.get('size') || 20);
    const rows = db.applications
      .filter((item) => !status || item.status === status)
      .slice()
      .reverse();
    return {
      records: rows.slice((page - 1) * size, page * size).map((item) => ({ ...item })),
      total: rows.length,
      page,
      size,
      pages: Math.max(1, Math.ceil(rows.length / size)),
    };
  }

  if (pathname === '/api/admin/seats/import' && method === 'POST') {
    return importSeats(db, data);
  }

  if (pathname === '/api/admin/seats' && method === 'GET') {
    const city = query.get('city') || '';
    const page = Number(query.get('page') || 1);
    const size = Number(query.get('size') || 20);
    const rows = (db.seats || [])
      .filter((item) => !city || item.eventCity === city)
      .slice()
      .reverse();
    return {
      records: rows.slice((page - 1) * size, page * size),
      total: rows.length,
      page,
      size,
      pages: Math.max(1, Math.ceil(rows.length / size)),
      ...seatSummary(db, city),
    };
  }

  if (segments[1] === 'admin' && segments[2] === 'applications' && segments[4] === 'review') {
    return reviewApplication(db, segments[3], data);
  }

  if (pathname === '/api/admin/checkin' && method === 'POST') {
    const application = db.applications.find((item) => String(item.id) === String(data.token)
      || item.phone === String(data.token));
    if (!application) throw fail(3004, '入场凭证无效');
    if (application.status !== 'APPROVED') throw fail(3007, '该申报尚未通过审核，无法核验入场');
    if (application.checkedInAt) throw fail(3006, '该嘉宾已完成入场核验');
    application.checkedInAt = nowIso();
    saveDb(db);
    return application;
  }

  throw fail(1002, '演示模式暂不支持该接口');
}
