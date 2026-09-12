/** localStorage 封装，键名与小程序保持一致，便于两端逻辑对照。 */

const PREFIX = 'bochu:';

export function getStorage(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

export function setStorage(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    /* 隐私模式或存储已满：忽略，功能降级为本次会话内有效 */
  }
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (err) {
    /* 同上 */
  }
}
