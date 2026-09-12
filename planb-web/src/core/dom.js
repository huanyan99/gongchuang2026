/** 模板与 DOM 工具：html 标签模板默认转义，嵌套模板与数组自动拼接。 */

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}

function stringify(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join('');
  return escapeHtml(value);
}

/** 受信任片段，仅用于本项目内部生成的标记 */
export function raw(value) {
  return new SafeHtml(String(value));
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    out += stringify(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}

/** 条件渲染，对应 wx:if */
export function when(condition, content) {
  if (!condition) return '';
  return typeof content === 'function' ? content() : content;
}

/** 条件类名，对应 wxml 里的 "{{a ? 'x' : ''}}" 写法 */
export function cx(...parts) {
  return parts
    .flatMap((part) => {
      if (!part) return [];
      if (typeof part === 'string') return [part];
      return Object.keys(part).filter((key) => part[key]);
    })
    .join(' ');
}
