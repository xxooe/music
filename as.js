/**
 * ads.js - 广告管理模块
 * 支持静态图片/HTML以及自定义第三方JavaScript广告代码引入
 */
(function(window) {
  'use strict';

  // 1. 广告配置中心：统一修改广告内容、链接和外接JS代码
  const AdConfig = {
    // ---- 广告位 1：底部 Banner 广告 (ban-slot) ----
    banner: {
      type: 'image', // 可选类型: 'image' (图片链接) 或 'custom' (插入HTML/外接第三方JS)
      // 当 type 为 'image' 时生效：
      pcImage: 'images/bb2.png',
      pcLink: 'https://movie.xxooe.com',
      mobileImage: 'images/cc3.png',
      mobileLink: 'https://github.com/jatoxu/jatoxu.github.io/releases/download/1.10/miaoying.1.1.0.apk',
      // 当 type 为 'custom' 时生效：
      customHtml: '<div id="third-party-banner-ad"></div><script src="https://example.com/ad-sdk.js"></script>'
    },

    // ---- 广告位 2：屏幕正中间弹窗广告 (popup) ----
    popup: {
      enabled: true, // 是否开启弹窗广告
      type: 'image', // 可选类型: 'image' 或 'custom'
      
      // 【新增功能】：弹窗频率限制（单位：小时）。
      // 设置为 1 表示 1小时内只弹一次；24 表示 24小时内只弹一次；设为 0 则每次刷新都弹出；-1则不弹。
      frequencyHours: 0, 

      // 电脑端弹窗配置
      pc: {
        image: 'images/cc2.png', // 示例图片，可更改为具体的弹窗海报图片
        link: 'https://movie.xxooe.com'
      },
      // 移动端弹窗配置
      mobile: {
        image: 'images/dd4.png', // 示例图片
        link: 'https://github.com/jatoxu/jatoxu.github.io/releases/download/1.10/miaoying.1.1.0.apk'
      },
      // 自定义代码
      customHtml: '<div id="popup-ad-widget"></div>'
    }
  };

  // 记录当前弹窗和设备类型状态
  let currentDeviceType = null;
  let popupClosedByUser = false; // 标记用户本次页面生命周期内是否手动点了关闭

  /**
   * 设备检测工具（参照更新逻辑）
   */
  function detectDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileByUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isMobileByScreen = window.innerWidth <= 768; // 统一移动端阀值为 768px
    
    const isMobile = isMobileByUA || isMobileByScreen;
    const deviceType = isMobile ? 'mobile' : 'desktop';
    
    return { isMobile, deviceType };
  }

  // 辅助函数：将含有 <script> 的 HTML 动态插入 DOM 并确保 script 执行
  function setInnerHTMLWithScripts(container, html) {
    container.innerHTML = html;
    const scripts = container.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const script = document.createElement('script');
      if (scripts[i].src) {
        script.src = scripts[i].src;
      } else {
        script.textContent = scripts[i].textContent;
      }
      document.head.appendChild(script).parentNode.removeChild(script);
    }
  }

  // 动态注入广告专属 CSS 样式
  function injectAdStyles() {
    if (document.getElementById('ad-manager-styles')) return;
    const style = document.createElement('style');
    style.id = 'ad-manager-styles';
    style.textContent = `
      /* 底部 Banner 样式 */
      .ban-slot {
        margin-top: 12px;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .ban-slot a {
        display: block;
        width: 100%;
      }
      .ban-slot img {
        height: 120px;
        width: 100%;
        border-radius: 12px;
        object-fit: cover;
        cursor: pointer;
        display: block;
      }
      @media (max-width: 768px) {
        .ban-slot {
          height: 90px;
          border-radius: 12px;
          margin-bottom: 6px;
        }
        .ban-slot img {
          height: 90px;
        }
      }

      // .ban-slot {
      //   margin-top: 12px;
      //   width: 100%;
      //   display: flex;
      //   justify-content: center;
      //   align-items: center;
      // }
      // .ban-slot a {
      //   display: block;
      //   width: 100%;
      // }
      // .ban-slot img {
      //   /* 删除固定height，改用最大高度限制 */
      //   max-height: 120px;  
      //   width: 100%;
      //   border-radius: 12px;
      //   object-fit: contain; /* 关键：完整显示图片，不裁切 */
      //   cursor: pointer;
      //   display: block;
      // }
      // @media (max-width: 768px) {
      //   .ban-slot {
      //     margin-bottom: 6px;
      //   }
      //   .ban-slot img {
      //     max-height: 90px; /* 移动端最大高度 */
      //   }
      // }

      /* 居中弹窗广告样式 */
      .apop-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      .apop-backdrop.show {
        opacity: 1;
      }
      .apop-container {
        position: relative;
        background: #121424;
        border-radius: 16px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.8), 0 0 20px rgba(245, 200, 76, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px;
        max-width: 90vw;
        max-height: 85vh;
        box-sizing: border-box;
        animation: adPopupScale 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      @keyframes adPopupScale {
        from { transform: scale(0.8); }
        to { transform: scale(1); }
      }
      /* 电脑端弹窗尺寸 */
      .apop-container.pc-view {
        // width: 60%;
        // height: 60%;
      }
      /* 手机端弹窗尺寸 */
      .apop-container.mobile-view {
        // width: 320px;
      }
      .apop-content {
        width: 100%;
        overflow: hidden;
        border-radius: 10px;
        min-height: 100px; /* 防止未加载前容器塌陷 */
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .apop-content a {
        display: block;
        width: 100%;
      }
      /* 修复弹窗图片可能不显示或坍缩的问题 */
      .apop-content img {
        width: 100%;
        max-width: 100%;
        height: auto;
        max-height: 60vh;
        object-fit: contain;
        display: block;
        border-radius: 10px;
        cursor: pointer;
      }
      /* 右上角叉叉关闭按钮 */
      .apop-close-x {
        position: absolute;
        top: -7px;
        right: -7px;
        width: 20px;
        height: 20px;
        background: #f5c84c;
        color: #000;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: bold;
        cursor: pointer;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        border: 2px solid #fff;
        z-index: 10;
        transition: transform 0.2s;
      }
      .apop-close-x:hover {
        transform: scale(1.15);
      }
      /* 正下方关闭按钮 */
      .apop-close-bottom {
        margin-top: 10px;
        padding: 6px 20px;
        background: rgba(255,255,255,0.15);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.3);
        border-radius: 999px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.2s;
      }
      .apop-close-bottom:hover {
        background: rgba(255,255,255,0.3);
      }
    `;
    document.head.appendChild(style);
  }

  // 初始化或更新 ban-slot 底部 Banner 广告
  function renderBannerSlot() {
    const slot = document.getElementById('ban-slot');
    if (!slot) return;

    const cfg = AdConfig.banner;
    const { isMobile } = detectDevice();

    slot.innerHTML = ''; // 清空内容重新加载

    if (cfg.type === 'custom') {
      setInnerHTMLWithScripts(slot, cfg.customHtml);
    } else {
      const imgSrc = isMobile ? cfg.mobileImage : cfg.pcImage;
      const targetLink = isMobile ? cfg.mobileLink : cfg.pcLink;

      const a = document.createElement('a');
      a.href = targetLink || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';

      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = 'Advertisement';

      a.appendChild(img);
      slot.appendChild(a);
    }
  }

  // 判定弹窗频控限制
  function shouldShowPopup() {
    const cfg = AdConfig.popup;
    if (!cfg.enabled) return false;
    if (popupClosedByUser) return false; // 本次页面访问中用户已手动关闭

    const freqHours = cfg.frequencyHours || 0;
    if (freqHours < 0) return false; else if (freqHours == 0) return true; // 未设置限制或设为0，每次都弹

    const storageKey = 'ad_popup_last_shown_time';
    const lastShown = localStorage.getItem(storageKey);

    if (lastShown) {
      const now = new Date().getTime();
      const passHours = (now - parseInt(lastShown, 10)) / (1000 * 60 * 60);
      if (passHours < freqHours) {
        return false; // 还没到设定的冷却时间，不弹出
      }
    }
    return true;
  }

  // 初始化或实时调整居中弹窗广告
  function renderPopupAd() {
    let backdrop = document.getElementById('apop-backdrop');
    
    // 如果不符合展示条件，销毁现有弹窗
    if (!shouldShowPopup()) {
      if (backdrop) backdrop.remove();
      return;
    }

    const cfg = AdConfig.popup;
    const { isMobile } = detectDevice();

    // 如果弹窗节点不存在，新建 DOM
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'apop-backdrop';
      backdrop.className = 'apop-backdrop';

      const container = document.createElement('div');
      container.id = 'apop-container';
      container.className = 'apop-container ' + (isMobile ? 'mobile-view' : 'pc-view');

      const closeX = document.createElement('div');
      closeX.className = 'apop-close-x';
      closeX.innerHTML = '&times;';
      closeX.title = '关闭广告';

      const content = document.createElement('div');
      content.id = 'apop-content';
      content.className = 'apop-content';

      // const closeBottom = document.createElement('button');
      // closeBottom.className = 'apop-close-bottom';
      // closeBottom.textContent = '关闭广告';

      // 关闭事件
      const closeAd = () => {
        popupClosedByUser = true; // 标记用户主动关闭
        backdrop.classList.remove('show');
        setTimeout(() => backdrop.remove(), 300);
      };

      closeX.addEventListener('click', closeAd);
      // closeBottom.addEventListener('click', closeAd);

      container.appendChild(closeX);
      container.appendChild(content);
      // container.appendChild(closeBottom);
      backdrop.appendChild(container);
      document.body.appendChild(backdrop);

      // 记录本次显示的成功时间点
      localStorage.setItem('ad_popup_last_shown_time', new Date().getTime().toString());

      requestAnimationFrame(() => {
        backdrop.classList.add('show');
      });
    } else {
      // 如果已存在 DOM，更新尺寸 Class
      const container = document.getElementById('apop-container');
      if (container) {
        container.className = 'apop-container ' + (isMobile ? 'mobile-view' : 'pc-view');
      }
    }

    // 更新内容（适应设备切屏）
    const content = document.getElementById('apop-content');
    if (content) {
      content.innerHTML = '';
      if (cfg.type === 'custom') {
        setInnerHTMLWithScripts(content, cfg.customHtml);
      } else {
        const popData = isMobile ? cfg.mobile : cfg.pc;
        const a = document.createElement('a');
        a.href = popData.link || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const img = document.createElement('img');
        img.src = popData.image;
        img.alt = 'Popup Ad';

        a.appendChild(img);
        content.appendChild(a);
      }
    }
  }

  // 统一绘制入口
  function renderAllAds() {
    injectAdStyles();
    renderBannerSlot();
    renderPopupAd();
  }

  // 2. 实时响应窗口变化（带防抖优化）
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const { deviceType } = detectDevice();
      // 仅在设备切换模式（Mobile <-> PC）或者实时窗口变化时触发重绘
      renderAllAds();
      currentDeviceType = deviceType;
    }, 200); // 200ms 防抖
  });

  // DOM 准备就绪后自动启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAllAds);
  } else {
    renderAllAds();
  }

  // 暴露 API 给外部
  window.AdManager = {
    config: AdConfig,
    reload: renderAllAds,
    // 方便手动重置频控测试
    resetPopupTimer: () => localStorage.removeItem('ad_popup_last_shown_time')
  };

})(window);