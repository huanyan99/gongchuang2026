/**
 * 设备视口：把 750 设计宽度映射到当前浏览器宽度。
 *
 * .stage 使用 CSS zoom 整体缩放，因此页面样式里的 1px 恒等于小程序的 1rpx；
 * zoom 不会像 transform 那样脱离布局，fixed/滚动/字体渲染都保持正常。
 */

const DESIGN_WIDTH = 750;
const MAX_DEVICE_WIDTH = 430;
const MAX_DEVICE_HEIGHT = 932;

function readSafeBottom() {
  const probe = document.getElementById('safeProbe');
  return probe ? probe.getBoundingClientRect().height : 0;
}

export function initViewport() {
  const root = document.documentElement.style;

  const apply = () => {
    const width = Math.min(window.innerWidth, MAX_DEVICE_WIDTH);
    const height = window.innerWidth <= MAX_DEVICE_WIDTH
      ? window.innerHeight
      : Math.min(window.innerHeight, MAX_DEVICE_HEIGHT);
    const scale = width / DESIGN_WIDTH;

    root.setProperty('--device-width', `${width}px`);
    root.setProperty('--device-height', `${height}px`);
    root.setProperty('--scale', String(scale));
    // env() 在 zoom 内部不会被换算，这里换算成设计稿单位再注入
    root.setProperty('--safe-bottom', `${(readSafeBottom() / scale).toFixed(2)}px`);
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
