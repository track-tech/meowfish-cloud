/* meowfish 图形 WebUI 前端（液态玻璃） */
(function () {
  'use strict';

  /* ---------- 国际化（zh / en，本地存储记住选择） ---------- */
  var I18N = {
    zh: {
      'manage': '管理', 'done': '完成', 'new-chat': '＋ 新建对话',
      'select-all': '全选', 'cancel': '取消', 'delete-selected': '删除所选',
      'model': '模型', 'theme': '主题', 'menu': '菜单',
      'regenerate': '🔄 重生成', 'continue': '✍️ 续写', 'character': '🐱 角色',
      'profile': '📝 设定', 'tools': '🛠️ 工具', 'search': '🔍 搜索',
      'export': '⬇️ 导出', 'help': '❓ 帮助', 'abort': '⏹ 中断',
      'input-placeholder': '输入消息…（@ 引用文件 · / 命令）',
      'send': '发送', 'no-match': '（无匹配项）', 'close': '关闭', 'confirm': '确认',
      'status-thinking': '思考中…', 'status-streaming': '输出中', 'status-tool': '工具运行中',
      'status-waiting': '等待授权…', 'status-error': '出错了', 'status-success': '完成',
      'no-sessions': '还没有会话', 'delete-session': '删除会话', 'current': '当前', 'pin': '置顶',
      'recent-sessions': '最近会话', 'empty-session': '未命名会话',
      'confirm-del-session': '确定删除这个会话吗？',
      'confirm-del-sessions': '确定删除选中的 {n} 个会话吗？此操作不可恢复。',
      'confirm-title': '确认操作',
      'voice': '语音回复', 'voice-on': '语音回复已开启：角色回复后自动朗读',
      'voice-off': '语音回复已关闭',
      'mic-hold': '按住说话（松开识别）', 'mic-listening': '正在聆听…松开结束',
      'mic-working': '正在识别…', 'mic-no-key': '未配置 MiMo API Key：点「设置 → 实时语音（MiMo）」填写',
      'mic-fail': '识别失败：', 'voice-fail': '朗读失败：', 'voice-play': '🔊 朗读',
      'daynight': '白日 / 暗夜切换（浅滩 ↔ 深海）',
      'time-now': '刚刚', 'time-min': ' 分钟前', 'time-hour': ' 小时前', 'time-yesterday': '昨天', 'time-day': '{m}月{d}日',
      'tooltips': {
        'tools': '电脑权限：开启后角色可读写文件、执行命令（需授权）',
        'websearch': '联网搜索：开启后角色可搜索最新信息（免授权）',
      },
    },
    en: {
      'manage': 'Manage', 'done': 'Done', 'new-chat': '＋ New Chat',
      'select-all': 'Select All', 'cancel': 'Cancel', 'delete-selected': 'Delete Selected',
      'model': 'Model', 'theme': 'Theme', 'menu': 'Menu',
      'regenerate': '🔄 Regenerate', 'continue': '✍️ Continue', 'character': '🐱 Character',
      'profile': '📝 Profile', 'tools': '🛠️ Tools', 'search': '🔍 Search',
      'export': '⬇️ Export', 'help': '❓ Help', 'abort': '⏹ Abort',
      'input-placeholder': 'Type a message… (@ reference · / commands)',
      'send': 'Send', 'no-match': '（no match）', 'close': 'Close', 'confirm': 'OK',
      'status-thinking': 'Thinking…', 'status-streaming': 'Writing', 'status-tool': 'Tool running',
      'status-waiting': 'Awaiting approval…', 'status-error': 'Error', 'status-success': 'Done',
      'no-sessions': 'No sessions yet', 'delete-session': 'Delete session', 'current': 'Current', 'pin': 'Pin',
      'recent-sessions': 'Recent Sessions', 'empty-session': 'Untitled Session',
      'confirm-del-session': 'Delete this session?',
      'confirm-del-sessions': 'Delete {n} selected sessions? This cannot be undone.',
      'confirm-title': 'Confirm',
      'voice': 'Voice reply', 'voice-on': 'Voice reply on: assistant replies are read aloud',
      'voice-off': 'Voice reply off',
      'mic-hold': 'Hold to talk (release to transcribe)', 'mic-listening': 'Listening… release to finish',
      'mic-working': 'Transcribing…', 'mic-no-key': 'MiMo API Key not set: Settings → Voice (MiMo)',
      'mic-fail': 'Recognition failed: ', 'voice-fail': 'Read-aloud failed: ', 'voice-play': '🔊 Read',
      'daynight': 'Day / Night toggle (Shoal ↔ Deep Sea)',
      'time-now': 'just now', 'time-min': 'm ago', 'time-hour': 'h ago', 'time-yesterday': 'Yesterday', 'time-day': '{m}/{d}',
      'tooltips': {
        'tools': 'Computer access: lets the character read/write files and run commands (with approval)',
        'websearch': 'Web search: lets the character search the latest info (no approval needed)',
      },
    },
  };

  var LANG = 'zh';
  try {
    LANG = localStorage.getItem('meowfish-lang') || 'zh';
  } catch (e) { /* ignore */ }
  if (!I18N[LANG]) LANG = 'zh';

  function t(key) {
    var d = I18N[LANG] || I18N.zh;
    return d[key] !== undefined ? d[key] : (I18N.zh[key] !== undefined ? I18N.zh[key] : key);
  }

  /** 应用静态文本（data-i18n 属性 + placeholder） */
  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
  }

  var $ = function (id) { return document.getElementById(id); };
  var messagesEl = $('messages');
  var inputEl = $('input');
  var meta = { userName: '你', assistantName: '喵鱼', modeLabel: 'RP', modelLabel: '' };
  var streamingEl = null;
  var dialog = null; // {id, kind}
  var currentStatus = 'idle';
  var animTick = 0;
  var thinkingFrames = ['(´･ω･`)', '(・ω・`)', '(｡•́︿•̀｡)'];
  var toolFrames = ['つ◕‿◕)つ', 'っ◕‿◕)っ'];

  /* ---------- 访问令牌（公网暴露时由服务器 --web-token 启用） ---------- */
  var TOKEN = '';
  try {
    TOKEN = localStorage.getItem('meowfish-token') || '';
  } catch (e) { /* ignore */ }

  /* ---------- 设备标识（云端多浏览器隔离：每台浏览器独立命名空间） ---------- */
  var DEVICE_ID = 'default';
  try {
    DEVICE_ID = localStorage.getItem('meowfish-device-id') || '';
    if (!DEVICE_ID) {
      DEVICE_ID = window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : 'dev-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
      localStorage.setItem('meowfish-device-id', DEVICE_ID);
    }
  } catch (e) { /* ignore */ }

  function withToken(path) {
    var q = path.indexOf('?') >= 0 ? '&' : '?';
    var parts = [];
    if (TOKEN) parts.push('token=' + encodeURIComponent(TOKEN));
    parts.push('device=' + encodeURIComponent(DEVICE_ID));
    return path + q + parts.join('&');
  }

  function askToken() {
    var t = window.prompt('请输入访问令牌：');
    if (!t) return false;
    TOKEN = t;
    try {
      localStorage.setItem('meowfish-token', t);
    } catch (e) { /* ignore */ }
    return true;
  }

  function post(path, body) {
    return fetch(withToken(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    })
      .then(function (res) {
        if (res.status === 401) {
          TOKEN = '';
          if (askToken()) location.reload();
          return null;
        }
        return res;
      })
      .catch(function () {});
  }

  function sendInput() {
    var text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    inputEl.style.height = 'auto';
    if (text.charAt(0) === '/') post('/ui/command', { line: text });
    else post('/ui/send', { text: text });
  }

  /* ---------- 渲染 ---------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 轻量 Markdown → HTML（输入已转义，无注入风险；不支持 HTML 原文） */
  function mdInline(s) {
    return s
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
      // 链接：只放行 http/https（及无协议相对路径），javascript:/data: 等危险协议仅保留文字
      .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, function (_, label, url) {
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) && !/^https?:/i.test(url)) return label;
        return '<a href="' + url + '" target="_blank" rel="noopener">' + label + '</a>';
      });
  }

  function mdToHtml(text) {
    var lines = String(text).split('\n');
    var html = [];
    var i = 0;
    var para = [];
    var flushPara = function () {
      if (para.length) {
        html.push('<p>' + mdInline(para.join('\n')) + '</p>');
        para = [];
      }
    };
    while (i < lines.length) {
      var line = lines[i];
      var fence = /^\s*(`{3,}|~{3,})\s*(\w*)\s*$/.exec(line);
      if (fence) {
        flushPara();
        var code = [];
        i++;
        var closeRe = new RegExp('^\\s*' + fence[1] + '\\s*$');
        while (i < lines.length && !closeRe.test(lines[i])) {
          code.push(lines[i]);
          i++;
        }
        i++;
        html.push('<pre><code>' + code.join('\n') + '</code></pre>');
        continue;
      }
      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flushPara();
        var lv = Math.min(3, h[1].length);
        html.push('<h' + lv + '>' + mdInline(h[2]) + '</h' + lv + '>');
        i++;
        continue;
      }
      if (/^\s*([-*_]){3,}\s*$/.test(line)) {
        flushPara();
        html.push('<hr>');
        i++;
        continue;
      }
      var li = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (li) {
        flushPara();
        var items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push('<li>' + mdInline(lines[i].replace(/^\s*[-*+]\s+/, '')) + '</li>');
          i++;
        }
        html.push('<ul>' + items.join('') + '</ul>');
        continue;
      }
      var q = /^\s*&gt;\s?(.*)$/.exec(line);
      if (q) {
        flushPara();
        var qs = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
          qs.push(lines[i].replace(/^\s*&gt;\s?/, ''));
          i++;
        }
        html.push('<blockquote>' + mdInline(qs.join('<br>')) + '</blockquote>');
        continue;
      }
      if (!line.trim()) {
        flushPara();
        i++;
        continue;
      }
      para.push(line);
      i++;
    }
    flushPara();
    return html.join('\n') || '';
  }

  function msgHtml(m) {
    if (m.role === 'system') {
      return '<div class="msg system">' + esc(m.content) + '</div>';
    }
    if (m.role === 'tool') {
      var firstLine = (m.content || '').split('\n')[0] || '';
      var summary = firstLine.length > 50 ? firstLine.slice(0, 50) + '…' : firstLine;
      return (
        '<div class="msg tool collapsed' + (m.error ? ' error' : '') + '">' +
        '<div class="tool-head">' +
        '<span class="tool-caret">▸</span>' +
        '<span class="tool-label">⚙ ' + esc(m.toolLabel || '') + '</span>' +
        '<span class="tool-summary">' + esc(summary) + '</span>' +
        '</div>' +
        '<pre class="tool-body">' + esc(m.content) + '</pre></div>'
      );
    }
    if (m.role === 'user') {
      return (
        '<div class="msg user">' +
        '<div class="bubble glass">' + mdToHtml(esc(m.content)) + '</div>' +
        '<div class="who">' + esc(m.name || meta.userName) + '</div></div>'
      );
    }
    var reasonBlock = '';
    if (m.reasoning) {
      reasonBlock =
        '<div class="reason collapsed">' +
        '<div class="reason-head"><span class="tool-caret">▸</span>💭 思考过程 <span class="reason-len">(' + m.reasoning.length + ' 字)</span></div>' +
        '<div class="reason-body">' + esc(m.reasoning) + '</div>' +
        '</div>';
    }
    return (
      '<div class="msg assistant' + (m.error ? ' error' : '') + '">' +
      '<div class="who"><span class="avatar"></span>' + esc(m.name || meta.assistantName) + '</div>' +
      reasonBlock +
      '<div class="bubble glass' + (m.streaming ? ' streaming' : '') + '"' + (m.streaming ? ' data-raw=""' : '') + '>' + mdToHtml(esc(m.content)) + (m.streaming ? '<span class="caret"></span>' : '') + '</div></div>'
    );
  }

  function appendMsg(m) {
    var div = document.createElement('div');
    div.innerHTML = msgHtml(m);
    var el = div.firstElementChild;
    // 批量恢复（切换会话后 clear+重填）：不播入场动画，避免整屏闪烁
    if (bulkFill) el.classList.add('no-anim');
    messagesEl.appendChild(el);
    if (m.streaming) {
      streamingEl = el.querySelector('.bubble');
      // 首个字到达前：不显示闪烁光标，改用「输入中」圆点，避免空气泡里只有个光标
      if (!m.content) {
        var caret = streamingEl.querySelector('.caret');
        if (caret) caret.remove();
        var dots = document.createElement('span');
        dots.className = 'typing';
        dots.innerHTML = '<i></i><i></i><i></i>';
        streamingEl.appendChild(dots);
      }
    }
    scrollBottom();
    return el;
  }

  function replaceLast(m) {
    var last = messagesEl.lastElementChild;
    if (last && last.classList.contains('msg')) {
      var div = document.createElement('div');
      div.innerHTML = msgHtml(m);
      messagesEl.replaceChild(div.firstElementChild, last);
    } else {
      appendMsg(m);
    }
  }

  function removeLast() {
    if (messagesEl.lastElementChild) messagesEl.removeChild(messagesEl.lastElementChild);
  }

  function removeN(n) {
    var children = messagesEl.children;
    var idx = children.length - n;
    if (idx >= 0) messagesEl.removeChild(children[idx]);
  }

  function replaceN(n, m) {
    var children = messagesEl.children;
    var idx = children.length - n;
    if (idx >= 0) {
      var div = document.createElement('div');
      div.innerHTML = msgHtml(m);
      messagesEl.replaceChild(div.firstElementChild, children[idx]);
    }
  }

  var rafPending = false;

  /* 把累积的原始文本一次性渲染为 Markdown HTML（每帧至多一次，快速流式输出不再逐 delta 全量重渲染） */
  function renderStreamingNow() {
    if (!streamingEl) return;
    streamingEl.innerHTML = mdToHtml(esc(streamingEl.getAttribute('data-raw') || '')) + '<span class="caret"></span>';
    scrollBottom();
  }

  function scheduleStreamingRender() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      renderStreamingNow();
    });
  }

  function appendDelta(text) {
    if (!streamingEl) return;
    // 首个字到达：移除「输入中」圆点，换成文本 + 闪烁光标
    var typing = streamingEl.querySelector('.typing');
    if (typing) typing.remove();
    // 原始文本累积在 data-raw，按帧增量重渲染为 Markdown HTML（输入先转义，无注入风险）
    var raw = streamingEl.getAttribute('data-raw') || '';
    raw += text;
    streamingEl.setAttribute('data-raw', raw);
    scheduleStreamingRender();
  }

  function appendReasonDelta(text) {
    var last = messagesEl.lastElementChild;
    if (!last || !last.classList.contains('assistant')) return;
    var block = last.querySelector('.reason');
    if (!block) {
      var div = document.createElement('div');
      div.innerHTML =
        '<div class="reason collapsed">' +
        '<div class="reason-head"><span class="tool-caret">▸</span>💭 思考过程 <span class="reason-len"></span></div>' +
        '<div class="reason-body"></div>' +
        '</div>';
      var bubble = last.querySelector('.bubble');
      last.insertBefore(div.firstElementChild, bubble);
      block = last.querySelector('.reason');
    }
    var body = block.querySelector('.reason-body');
    body.textContent += text;
    var len = block.querySelector('.reason-len');
    len.textContent = '(' + body.textContent.length + ' 字)';
  }

  function endStream() {
    if (streamingEl) {
      // 结束前把本帧挂起的增量立即渲染（rAF 尚未触发时）
      rafPending = false;
      renderStreamingNow();
      var caret = streamingEl.querySelector('.caret');
      if (caret) caret.remove();
      streamingEl.classList.remove('streaming');
      // 空内容结束（无字可显示）→ 移除空气泡
      if (!streamingEl.textContent) {
        var msgEl = streamingEl.closest('.msg');
        if (msgEl) msgEl.remove();
      }
    }
    streamingEl = null;
  }

  function failStream(text) {
    if (streamingEl) {
      // 先把本帧挂起的增量渲染出来，再叠加错误标记
      rafPending = false;
      renderStreamingNow();
      if (!streamingEl.textContent) streamingEl.textContent = text;
      streamingEl.classList.remove('streaming');
      var caret = streamingEl.querySelector('.caret');
      if (caret) caret.remove();
    }
    rafPending = false;
    streamingEl = null;
  }

  function clearMsgs() {
    messagesEl.innerHTML = '';
  }

  /* 批量填充窗口：clear 后短时间内追加的消息视为「会话恢复」，不播入场动画 */
  var bulkFill = false;
  var bulkTimer = null;

  function markBulkFill() {
    bulkFill = true;
    if (bulkTimer) clearTimeout(bulkTimer);
    bulkTimer = setTimeout(function () { bulkFill = false; }, 400);
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /* ---------- 元信息 / 状态 ---------- */

  function hexToRgb(hex) {
    var v = (hex || '#7dd3fc').replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    var n = parseInt(v, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ');
  }

  function applyTheme(t) {
    if (!t) return;
    meta.theme = t;
    var r = document.documentElement.style;
    r.setProperty('--bg', t.bg);
    r.setProperty('--fg', t.fg);
    r.setProperty('--dim', t.dim);
    r.setProperty('--accent', t.accent);
    r.setProperty('--accent-rgb', hexToRgb(t.accent));
    r.setProperty('--user', t.user);
    r.setProperty('--user-rgb', hexToRgb(t.user));
    r.setProperty('--assistant', t.assistant);
    r.setProperty('--assistant-rgb', hexToRgb(t.assistant));
    r.setProperty('--tool', t.tool);
    r.setProperty('--error', t.error);
    r.setProperty('--warning', t.warning);
    r.setProperty('--border', t.border);
    r.setProperty('--selection', t.selection);
    // 浅色主题：切换 light 类，玻璃样式从「白色透亮」换成「深色投影」体系
    var light = isLightHex(t.bg);
    document.documentElement.classList.toggle('light', light);
    // 白日/暗夜按钮图标跟随当前主题明暗（顶栏 + 移动端快捷栏两处）
    var lightIcon = light ? '☀️' : '🌙';
    var dn = $('btn-daynight');
    if (dn) dn.textContent = lightIcon;
    var dnm = $('btn-daynight-mob');
    if (dnm) dnm.textContent = lightIcon;
  }

  function isLightHex(hex) {
    var v = (hex || '#0b0f1a').replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    var r = parseInt(v.slice(0, 2), 16) / 255;
    var g = parseInt(v.slice(2, 4), 16) / 255;
    var b = parseInt(v.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
  }

  function applyMeta(m) {
    if (m.theme) applyTheme(m.theme);
    if (m.modeLabel !== undefined) {
      meta.modeLabel = m.modeLabel;
      $('mode-badge').textContent = m.modeLabel;
      $('mode-badge').classList.toggle('agent', m.modeLabel === 'AGENT');
    }
    if (m.title !== undefined) $('title').textContent = m.title;
    if (m.modelLabel !== undefined) meta.modelLabel = m.modelLabel;
    if (m.tokens !== undefined) meta.tokens = m.tokens;
    $('meta-info').textContent = [meta.modelLabel, meta.tokens].filter(Boolean).join(' · ');
    if (m.userName !== undefined) meta.userName = m.userName;
    if (m.assistantName !== undefined) meta.assistantName = m.assistantName;
    if (m.yolo !== undefined) $('yolo-badge').classList.toggle('hidden', !m.yolo);
    if (m.tools !== undefined) {
      meta.tools = m.tools;
      $('tools-switch').checked = m.tools;
      renderSessions(); // ⚙ 跟随开关状态刷新
    }
    if (m.webSearch !== undefined) {
      meta.webSearch = m.webSearch;
      $('websearch-switch').checked = m.webSearch;
    }
    if (m.sessionId !== undefined) meta.sessionId = m.sessionId;
    document.title = (m.title || 'MeowFish') + ' · MeowFish';
  }

  /* ---------- 侧边栏会话列表 ---------- */

  function relTime(ts) {
    var diff = (Date.now() - ts) / 1000;
    if (diff < 60) return t('time-now');
    if (diff < 3600) return Math.floor(diff / 60) + t('time-min');
    if (diff < 86400) return Math.floor(diff / 3600) + t('time-hour');
    if (diff < 86400 * 2) return t('time-yesterday');
    var d = new Date(ts);
    return t('time-day').replace('{m}', String(d.getMonth() + 1)).replace('{d}', String(d.getDate()));
  }

  var manageMode = false;
  var selected = {};
  var lastSessionClick = 0; // 切换会话防抖：连点竞态保护（服务端异步加载，避免先点后到）
  var lastSessionKey = '';  // 列表渲染缓存：内容未变时不重建（避免切换会话/操作后列表闪烁）
  var lastSessionId = '';   // 当前高亮会话：仅高亮变化时局部更新，不重建列表

  function renderSessions() {
    var list = $('session-list');
    var items = meta.sessions || [];
    // 内容签名（不含高亮）：id/标题/时间/置顶/管理模式/勾选/工具标记任一变化才重建
    var contentKey = JSON.stringify([
      manageMode,
      meta.tools === true,
      items.map(function (s) { return [s.id, s.title, s.updatedAt, s.pinned === true]; }),
      Object.keys(selected).filter(function (k) { return selected[k]; }).sort(),
    ]);
    if (contentKey === lastSessionKey) {
      // 仅高亮（会话切换）变化：局部更新 active/cur-tag/tools-mark，不重建、不重播动画
      if (meta.sessionId !== lastSessionId) {
        lastSessionId = meta.sessionId;
        var byId = {};
        items.forEach(function (s) { byId[s.id] = s; });
        list.querySelectorAll('.session-item').forEach(function (el) {
          var id = el.getAttribute('data-id');
          var active = id === meta.sessionId;
          el.classList.toggle('active', active);
          var s = byId[id];
          var titleEl = el.querySelector('.session-title');
          if (titleEl && s) {
            titleEl.innerHTML =
              (active ? '<span class="cur-tag">' + t('current') + '</span>' : '') +
              (active && meta.tools ? '<span class="tools-mark" title="⚙">⚙</span>' : '') +
              esc(s.title || t('empty-session'));
          }
        });
      }
      updateManageBar();
      return;
    }
    lastSessionKey = contentKey;
    lastSessionId = meta.sessionId;
    list.innerHTML = items.map(function (s) {
      var active = s.id === meta.sessionId;
      var isCurrent = s.id === meta.sessionId;
      var checked = selected[s.id] && !isCurrent;
      var pinned = s.pinned === true;
      return (
        '<div class="session-item' + (active ? ' active' : '') + (checked ? ' checked' : '') + '" data-id="' + esc(s.id) + '">' +
        (manageMode
          ? '<span class="session-check">' + (checked ? '✓' : '') + '</span>'
          : '') +
        '<div class="session-main">' +
        '<div class="session-title">' +
        (isCurrent ? '<span class="cur-tag">' + t('current') + '</span>' : '') +
        (s.id === meta.sessionId && meta.tools ? '<span class="tools-mark" title="⚙">⚙</span>' : '') +
        esc(s.title || t('empty-session')) +
        '</div>' +
        '<div class="session-meta">' + esc(relTime(s.updatedAt)) + '</div>' +
        '</div>' +
        (manageMode ? '' :
          '<button class="session-pin' + (pinned ? ' pinned' : '') + '" title="' + t('pin') + '">📌</button>' +
          '<button class="session-del" title="' + t('delete-session') + '">×</button>') +
        '</div>'
      );
    }).join('') || '<div class="session-empty">' + t('no-sessions') + '</div>';
    list.querySelectorAll('.session-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var id = el.getAttribute('data-id');
        if (manageMode) {
          if (id === meta.sessionId) return; // 当前会话不可选
          // 局部更新勾选状态（不重建列表：保留滚动位置、不重播动画）
          selected[id] = !selected[id];
          var on = selected[id];
          el.classList.toggle('checked', on);
          var chk = el.querySelector('.session-check');
          if (chk) chk.textContent = on ? '✓' : '';
          updateManageBar();
          return;
        }
        if (e.target.closest('.session-del')) return;
        if (e.target.closest('.session-pin')) return;
        // 防抖：250ms 内忽略连点，避免异步加载竞态（先点后到）
        var now = Date.now();
        if (now - lastSessionClick < 250) return;
        lastSessionClick = now;
        post('/ui/load-session', { id: id });
        closeSidebar();
      });
      var pinBtn = el.querySelector('.session-pin');
      if (pinBtn) {
        pinBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          post('/ui/toggle-pin', { id: el.getAttribute('data-id') });
        });
      }
      var delBtn = el.querySelector('.session-del');
      if (delBtn) {
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          localConfirm(t('confirm-del-session'), function () {
            post('/ui/delete-session', { id: el.getAttribute('data-id') });
          });
        });
      }
    });
    updateManageBar();
  }

  function updateManageBar() {
    var bar = $('manage-bar');
    var items = meta.sessions || [];
    var selectable = items.filter(function (s) { return s.id !== meta.sessionId; });
    bar.classList.toggle('hidden', !manageMode);
    if (manageMode) {
      $('manage-select-all').checked = selectable.length > 0 && selectable.every(function (s) { return selected[s.id]; });
      var count = selectable.filter(function (s) { return selected[s.id]; }).length;
      $('btn-manage-delete').textContent = t('delete-selected') + (count ? '(' + count + ')' : '');
    }
  }

  function setManageMode(on) {
    manageMode = on;
    selected = {};
    renderSessions();
  }

  function openSidebar() {
    $('sidebar').classList.add('open');
    $('sidebar-backdrop').classList.remove('hidden');
  }

  function closeSidebar() {
    $('sidebar').classList.remove('open');
    $('sidebar-backdrop').classList.add('hidden');
  }

  var idleTimer = null;

  function setStatus(status, text) {
    currentStatus = status;
    var bar = $('statusbar');
    var el = $('status-text');
    // 状态条只在有状态时出现：空闲自动收起（「完成」等信息稍作停留再收起，避免一闪而过）
    var wasVisible = !bar.classList.contains('hidden');
    el.textContent = status === 'idle' ? '' : text || statusTextOf(status);
    el.className = status;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (status === 'idle') {
      $('kaomoji').textContent = '';
      if (wasVisible) idleTimer = setTimeout(function () { bar.classList.add('hidden'); }, 1500);
      else bar.classList.add('hidden');
    } else {
      bar.classList.remove('hidden');
    }
    // 「中断」只在运行中显示（思考/输出/工具/等待授权/出错时）
    $('btn-abort').classList.toggle('hidden', status === 'idle');
  }

  function statusTextOf(s) {
    return { thinking: t('status-thinking'), streaming: t('status-streaming'), tool: t('status-tool'), waiting: t('status-waiting'), error: t('status-error'), success: t('status-success') }[s] || '';
  }

  function tickAnim() {
    animTick++;
    if (currentStatus === 'thinking') $('kaomoji').textContent = thinkingFrames[animTick % thinkingFrames.length] + ' ';
    else if (currentStatus === 'tool') $('kaomoji').textContent = toolFrames[animTick % toolFrames.length] + ' ';
  }

  /* ---------- 对话框 ---------- */

  /** 帮助文本 → 分组卡片 HTML（━━ 标题行 → 分组；命令行按 ≥2 空格拆「命令 + 说明」） */
  function renderHelp(text) {
    var lines = String(text).split('\n');
    var html = [];
    var inGroup = false;
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      var sec = /^[━=─-]{2,}\s*(.+?)\s*[━=─-]{2,}$/.exec(t);
      if (sec) {
        if (inGroup) html.push('</div>');
        inGroup = true;
        html.push('<div class="help-group"><div class="help-group-title">' + esc(sec[1]) + '</div>');
        return;
      }
      var parts = t.split(/\s{2,}/);
      if (parts.length >= 2 && parts[0].length <= 40) {
        html.push('<div class="help-row"><code>' + esc(parts[0]) + '</code><span>' + esc(parts.slice(1).join(' ')) + '</span></div>');
      } else {
        html.push('<div class="help-line">' + esc(t) + '</div>');
      }
    });
    if (inGroup) html.push('</div>');
    return html.join('');
  }

  function showDialog(m) {
    dialog = { id: m.id, kind: m.kind };
    $('modal-backdrop').classList.remove('hidden');
    $('modal-title').textContent = m.title;
    var body = $('modal-body');
    var actions = $('modal-actions');
    var filter = $('modal-filter');
    body.innerHTML = '';
    actions.innerHTML = '';
    filter.classList.add('hidden');

    if (m.kind === 'picker') {
      var items = m.items || [];
      var renderList = function (q) {
        var visible = items.filter(function (it) { return it.label.toLowerCase().indexOf(q.toLowerCase()) >= 0; });
        body.innerHTML = visible.map(function (it, i) {
          return '<div class="pick-item" data-i="' + items.indexOf(it) + '"><span>' + esc(it.label) + '</span><span class="pick-detail">' + esc(it.detail || '') + '</span></div>';
        }).join('') || '<div class="pick-empty">' + t('no-match') + '</div>';
        body.querySelectorAll('.pick-item').forEach(function (el) {
          el.addEventListener('click', function () {
            var it = items[Number(el.getAttribute('data-i'))];
            post('/ui/pick', { id: m.id, value: it.value });
            hideDialog();
          });
        });
      };
      if (m.filterable) {
        filter.classList.remove('hidden');
        var fi = $('modal-filter-input');
        fi.value = '';
        fi.oninput = function () { renderList(fi.value); };
        fi.focus();
      }
      renderList('');
      actions.innerHTML = '<button class="modal-btn" id="dlg-cancel">' + t('cancel') + '</button>';
    } else if (m.kind === 'multi') {
      // 多选列表（批量管理）：点击勾选，确认回传全部勾选项
      var multiItems = m.items || [];
      var selected = {};
      (m.selected || []).forEach(function (v) { selected[v] = true; });
      var renderMulti = function () {
        body.innerHTML = multiItems.map(function (it) {
          var on = !!selected[it.value];
          return '<div class="pick-item multi' + (on ? ' checked' : '') + '" data-v="' + esc(it.value) + '">' +
            '<span class="multi-check">' + (on ? '✓' : '') + '</span>' +
            '<span class="multi-label">' + esc(it.label) + '</span>' +
            '<span class="pick-detail">' + esc(it.detail || '') + '</span></div>';
        }).join('') || '<div class="pick-empty">' + t('no-match') + '</div>';
        body.querySelectorAll('.pick-item.multi').forEach(function (el) {
          el.addEventListener('click', function () {
            var v = el.getAttribute('data-v');
            selected[v] = !selected[v];
            renderMulti();
            updateMultiBtn();
          });
        });
      };
      var updateMultiBtn = function () {
        var n = Object.keys(selected).filter(function (k) { return selected[k]; }).length;
        var btn = $('dlg-submit');
        if (btn) btn.textContent = t('confirm') + (n ? ' (' + n + ')' : '');
      };
      renderMulti();
      actions.innerHTML = '<button class="modal-btn primary" id="dlg-submit">' + t('confirm') + '</button><button class="modal-btn" id="dlg-cancel">' + t('cancel') + '</button>';
      $('dlg-submit').addEventListener('click', function () {
        var values = Object.keys(selected).filter(function (k) { return selected[k]; });
        post('/ui/multi', { id: m.id, values: values });
        hideDialog();
      });
      updateMultiBtn();
    } else if (m.kind === 'confirm') {
      body.innerHTML = '<div class="confirm-detail">' + esc(m.detail).replace(/\n/g, '<br>') + '</div>';
      actions.innerHTML = (m.options || []).map(function (o) {
        return '<button class="modal-btn" data-key="' + esc(o.key) + '">[' + esc(o.key) + '] ' + esc(o.label) + '</button>';
      }).join('');
      actions.querySelectorAll('.modal-btn').forEach(function (el) {
        el.addEventListener('click', function () {
          post('/ui/confirm', { id: m.id, key: el.getAttribute('data-key') });
          hideDialog();
        });
      });
    } else if (m.kind === 'form') {
      body.innerHTML = (m.fields || []).map(function (f, i) {
        if (f.options && f.options.length) {
          var opts = f.options.map(function (o) {
            return '<option' + (o === f.value ? ' selected' : '') + '>' + esc(o) + '</option>';
          }).join('');
          return '<label class="form-field"><span>' + esc(f.label) + '</span><select data-i="' + i + '">' + opts + '</select></label>';
        }
        if (f.multiline) {
          return '<label class="form-field"><span>' + esc(f.label) + '</span><textarea rows="3" data-i="' + i + '" placeholder="' + esc(f.placeholder || '') + '">' + esc(f.value) + '</textarea></label>';
        }
        return '<label class="form-field"><span>' + esc(f.label) + '</span><input type="text" data-i="' + i + '" value="' + esc(f.value) + '" placeholder="' + esc(f.placeholder || '') + '"></label>';
      }).join('');
      // 预设联动：下拉（如提供商）变化时自动填充关联字段（BaseUrl / 模型名等）
      if (m.presets && m.presets.map) {
        var sel = body.querySelector('select[data-i="' + m.presets.selector + '"]');
        if (sel) {
          sel.addEventListener('change', function () {
            var links = m.presets.map[sel.value];
            if (!links) return;
            links.forEach(function (l) {
              var el = body.querySelector('[data-i="' + l.field + '"]');
              if (el) el.value = l.value;
            });
          });
        }
      }
      actions.innerHTML = '<button class="modal-btn primary" id="dlg-submit">' + t('confirm') + '</button><button class="modal-btn" id="dlg-cancel">' + t('cancel') + '</button>';
      $('dlg-submit').addEventListener('click', function () {
        var fields = body.querySelectorAll('input, textarea, select');
        var values = Array.prototype.map.call(fields, function (i) { return i.value; });
        post('/ui/form', { id: m.id, values: values });
        hideDialog();
      });
      var firstInput = body.querySelector('input, textarea');
      if (firstInput) firstInput.focus();
    } else if (m.kind === 'help') {
      body.innerHTML = renderHelp(m.text);
      actions.innerHTML = '<button class="modal-btn" id="dlg-cancel">' + t('close') + '</button>';
    }
    var cancelBtn = $('dlg-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      post('/ui/close', { id: m.id });
      hideDialog();
    });
  }

  function hideDialog() {
    dialog = null;
    $('modal-backdrop').classList.add('hidden');
  }

  /* ---------- 本地居中确认弹窗（删除会话等，替代浏览器原生 confirm） ---------- */

  function localConfirm(message, onOk) {
    var backdrop = $('local-confirm-backdrop');
    $('local-confirm-title').textContent = t('confirm-title');
    $('local-confirm-msg').textContent = message;
    backdrop.classList.remove('hidden');
    var okBtn = $('local-confirm-ok');
    var cancelBtn = $('local-confirm-cancel');
    okBtn.textContent = t('confirm');
    cancelBtn.textContent = t('cancel');
    var done = false;
    var finish = function (result) {
      if (done) return;
      done = true;
      backdrop.classList.add('hidden');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      backdrop.onclick = null;
      if (result) onOk();
    };
    okBtn.onclick = function () { finish(true); };
    cancelBtn.onclick = function () { finish(false); };
    backdrop.onclick = function (e) {
      if (e.target === backdrop) finish(false);
    };
    okBtn.focus();
  }

  /* ---------- 本地用户配置（localStorage 缓存：模型/用户设定/SSH 凭据存浏览器，云端不落盘） ---------- */
  var LOCAL_CONFIG_KEY = 'meowfish-local-config';

  function loadLocalConfig() {
    try {
      var raw = localStorage.getItem(LOCAL_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveLocalConfig(cfg) {
    try {
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(cfg));
    } catch (e) { /* ignore */ }
  }

  /* ---------- 本地数据（云端零持久化：会话/角色卡只存浏览器，连接时上传，变更时写回） ---------- */
  var LOCAL_DATA_KEY = 'meowfish-local-data';

  function loadLocalData() {
    try {
      var raw = localStorage.getItem(LOCAL_DATA_KEY);
      var data = raw ? JSON.parse(raw) : null;
      // 旧数据补齐 createdAt（缺失时用当前 updatedAt 固化一次），保证按创建时间稳定排序
      if (data && Array.isArray(data.sessions)) {
        data.sessions.forEach(function (s) {
          if (s && typeof s.updatedAt === 'number' && typeof s.createdAt !== 'number') {
            s.createdAt = s.updatedAt;
          }
        });
      }
      return data;
    } catch (e) { return null; }
  }

  function saveLocalData(data) {
    try {
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
    } catch (e) { /* 配额满时静默忽略 */ }
  }

  /* ---------- SSE ---------- */

  function connect() {
    // 云端零持久化：先上传浏览器本地数据（会话/角色卡），再开事件流恢复界面
    post('/ui/sync', { data: loadLocalData() }).then(openEventSource).catch(openEventSource);
  }

  function openEventSource() {
    var es = new EventSource(withToken('/events'));
    es.onmessage = function (e) {
      var m;
      try {
        m = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      switch (m.type) {
        case 'snapshot':
          applyMeta(m.state);
          if (m.state.sessions) {
            meta.sessions = m.state.sessions;
            renderSessions();
          }
          clearMsgs();
          m.state.messages.forEach(function (msg) {
            // 防御：服务器已空闲但消息残留 streaming 标记 → 清掉，避免出现卡死的闪烁光标
            if (msg.streaming && m.state.status === 'idle') msg.streaming = false;
            appendMsg(msg);
          });
          setStatus(m.state.status, m.state.statusText);
          // 连接建立后把本地配置推给 Worker（首次无配置时 Worker 会用默认并回推）
          post('/ui/local-config', { config: loadLocalConfig() });
          break;
        case 'sync':
          // Worker 回推完整数据快照（会话/角色卡/当前会话）→ 浏览器本地持久化
          if (m.data) saveLocalData(m.data);
          break;
        case 'config':
          // Worker 回推的配置变更 → 缓存到浏览器本地
          saveLocalConfig(m.config);
          // 语音 key 同步：云端设置面板更新后立即生效
          if (m.config && m.config.general && typeof m.config.general.mimoKey === 'string') {
            speechKey = m.config.general.mimoKey;
          }
          // 语言切换：服务端配置变更后应用并重载界面
          if (m.config && m.config.general && typeof m.config.general.lang === 'string' && m.config.general.lang !== LANG) {
            LANG = m.config.general.lang;
            try { localStorage.setItem('meowfish-lang', LANG); } catch (e) { /* ignore */ }
            location.reload();
          }
          break;
        case 'meta':
          applyMeta(m);
          if (m.sessionId !== undefined) {
            meta.sessionId = m.sessionId;
            renderSessions();
          }
          break;
        case 'sessions':
          meta.sessions = m.list;
          meta.sessionId = m.currentId;
          // 清理已不存在的选中项
          var keep = {};
          m.list.forEach(function (s) {
            if (selected[s.id]) keep[s.id] = true;
          });
          selected = keep;
          renderSessions();
          break;
        case 'msg':
          appendMsg(m.msg);
          break;
        case 'clear':
          clearMsgs();
          markBulkFill();
          break;
        case 'replaceLast':
          replaceLast(m.msg);
          break;
        case 'removeLast':
          removeLast();
          break;
        case 'removeN':
          removeN(m.n);
          break;
        case 'replaceN':
          replaceN(m.n, m.msg);
          break;
        case 'streamStart':
          appendMsg({ role: m.role || 'assistant', name: m.name, content: '', streaming: true });
          break;
        case 'delta':
          appendDelta(m.text);
          break;
        case 'reasonDelta':
          appendReasonDelta(m.text);
          break;
        case 'streamEnd':
          endStream();
          break;
        case 'streamFail':
          failStream(m.text);
          break;
        case 'status':
          setStatus(m.status, m.text);
          break;
        case 'insert':
          inputEl.value += m.text;
          inputEl.focus();
          break;
        case 'dialog':
          showDialog(m);
          break;
        case 'dialogClose':
          if (dialog && dialog.id === m.id) hideDialog();
          break;
      }
    };
    es.onerror = function () {
      es.close();
      setTimeout(connect, 800);
    };
  }

  /* ---------- 实时语音（MiMo ASR/TTS） ---------- */

  var VOICE_KEY = 'meowfish-voice';       // localStorage：语音回复开关
  var voiceSpeak = false;                 // 回复后自动朗读
  var voiceBusy = false;                  // 朗读中（避免重叠）
  var micRec = null;                      // {ctx, processor, chunks, stream, stop}
  var audioCtx = null;                    // 播放用 AudioContext（首次用户手势时创建）
  var speechKey = '';                     // MiMo key：请求头带上（本地服务端 secrets 兜底）

  try {
    var _lc = loadLocalConfig();
    if (_lc && _lc.general && typeof _lc.general.mimoKey === 'string') speechKey = _lc.general.mimoKey;
  } catch (e) { /* ignore */ }

  function voiceHeaders() {
    var h = { 'Content-Type': 'application/json' };
    if (speechKey) h['x-mimo-key'] = speechKey;
    return h;
  }

  /* ---- 语音回复开关 ---- */
  function setVoiceSpeak(on) {
    voiceSpeak = on;
    try { localStorage.setItem(VOICE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    $('btn-voice').classList.toggle('on', on);
    $('btn-voice').textContent = (on ? '🔊 ' : '🔇 ') + t('voice');
    setStatus(on ? 'success' : 'idle', on ? t('voice-on') : t('voice-off'));
  }

  /* ---- 朗读（TTS：SSE 流式 PCM16 → AudioContext 播放） ---- */
  function speakText(text) {
    if (voiceBusy) return; // 上一次朗读未结束，跳过（避免串音）
    voiceBusy = true;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { voiceBusy = false; return; }
    var chunks = []; // {buf: ArrayBuffer, sampleRate}
    fetch(withToken('/ui/voice-tts'), {
      method: 'POST',
      headers: voiceHeaders(),
      body: JSON.stringify({ text: text }),
    }).then(function (res) {
      if (!res || !res.ok || !res.body) throw new Error((t('voice-fail') + 'HTTP ' + (res ? res.status : '?')));
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { flushSse(); return; }
          buf += decoder.decode(r.value, { stream: true });
          var idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            var frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            frame.split('\n').forEach(function (line) {
              if (!line.startsWith('data:')) return;
              var payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') return;
              try {
                var m = JSON.parse(payload);
                if (m.error) throw new Error(m.error);
                if (m.pcm) chunks.push(m.pcm);
              } catch (e) { /* skip */ }
            });
          }
          return pump();
        });
      }
      function flushSse() {
        // 全部 PCM 到位后播放（每块 24kHz PCM16 拼接）
        try {
          var all = chunks.join('');
          if (!all) throw new Error(t('voice-fail'));
          var bin = atob(all);
          var pcm = new Int16Array(bin.length / 2);
          for (var i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16;
          var buffer = audioCtx.createBuffer(1, pcm.length, 24000);
          var data = buffer.getChannelData(0);
          for (var j = 0; j < pcm.length; j++) data[j] = pcm[j] / 32768;
          var src = audioCtx.createBufferSource();
          src.buffer = buffer;
          src.connect(audioCtx.destination);
          src.onended = function () { voiceBusy = false; };
          src.start();
        } catch (e) {
          voiceBusy = false;
          pushToast(t('voice-fail') + (e instanceof Error ? e.message : ''));
        }
      }
      return pump().catch(function () { voiceBusy = false; });
    }).catch(function (e) {
      voiceBusy = false;
      pushToast(t('voice-fail') + (e instanceof Error ? e.message : ''));
    });
  }

  /* ---- 按住说话（录音 → WAV → 识别） ---- */
  function startMic() {
    if (micRec) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      pushToast(t('mic-fail') + 'getUserMedia unavailable');
      return;
    }
    setStatus('tool', t('mic-listening'));
    var ctx = null;
    var processor = null;
    var chunks = [];
    var stream = null;
    var stopped = false;
    var promise = navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (s) {
        stream = s;
        // 16kHz 单声道采集（与 MiMo ASR 匹配）
        ctx = new AudioContext({ sampleRate: 16000 });
        var src = ctx.createMediaStreamSource(s);
        processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = function (e) {
          if (stopped) return;
          var input = e.inputBuffer.getChannelData(0);
          chunks.push(new Float32Array(input));
        };
        src.connect(processor);
        processor.connect(ctx.destination);
      })
      .catch(function (e) {
        pushToast(t('mic-fail') + (e instanceof Error ? e.message : String(e)));
        setStatus('idle');
      });
    micRec = {
      stop: function () {
        if (stopped) return;
        stopped = true;
        promise.then(function () {
          try { processor.disconnect(); } catch (e) { /* ignore */ }
          try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
          try { ctx.close(); } catch (e) { /* ignore */ }
          micRec = null;
          var total = 0;
          chunks.forEach(function (c) { total += c.length; });
          if (!total) {
            setStatus('idle');
            return;
          }
          var pcm = new Float32Array(total);
          var off = 0;
          chunks.forEach(function (c) { pcm.set(c, off); off += c.length; });
          // 转 16-bit WAV（header + data）
          var wav = encodeWav(pcm, 16000);
          setStatus('tool', t('mic-working'));
          fetch(withToken('/ui/voice-stt'), {
            method: 'POST',
            headers: voiceHeaders(),
            body: JSON.stringify({ audio: wav }),
          }).then(function (res) {
            return res && res.ok ? res.json() : Promise.reject(new Error(res ? res.status : ''));
          }).then(function (j) {
            setStatus('idle');
            if (j && j.text) {
              inputEl.value += (inputEl.value && !inputEl.value.endsWith(' ') ? ' ' : '') + j.text;
              inputEl.focus();
              // 识别到文本后自动发送（无需再点发送）
              sendInput();
            }
          }).catch(function (e) {
            setStatus('idle');
            pushToast(t('mic-fail') + (e instanceof Error ? e.message : String(e)));
          });
        });
      },
    };
  }

  function encodeWav(pcm, sampleRate) {
    var n = pcm.length;
    var buf = new ArrayBuffer(44 + n * 2);
    var dv = new DataView(buf);
    function wstr(off, s) { for (var i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); }
    wstr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    wstr(36, 'data'); dv.setUint32(40, n * 2, true);
    for (var i = 0; i < n; i++) {
      var v = Math.max(-1, Math.min(1, pcm[i]));
      dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    var bin = '';
    var bytes = new Uint8Array(buf);
    for (var j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
    return btoa(bin);
  }

  function pushToast(msg) {
    // 轻量提示：复用状态条，稍后收起
    setStatus('error', msg);
  }

  /* ---------- 交互 ---------- */

  $('btn-send').addEventListener('click', sendInput);
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendInput();
    }
  });

  /* ---- 语音：按住说话 + 语音回复开关 ---- */
  var micBtn = $('btn-mic');
  var micDown = false;
  function micPress(e) {
    if (e && e.preventDefault) e.preventDefault();
    micDown = true;
    startMic();
  }
  function micRelease() {
    if (!micDown) return;
    micDown = false;
    if (micRec) micRec.stop();
  }
  micBtn.addEventListener('pointerdown', micPress);
  micBtn.addEventListener('pointerup', micRelease);
  micBtn.addEventListener('pointercancel', micRelease);
  micBtn.addEventListener('pointerleave', micRelease);
  micBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // 触屏：长按开始、松开结束
  micBtn.addEventListener('touchstart', micPress, { passive: false });
  micBtn.addEventListener('touchend', micRelease);
  micBtn.addEventListener('touchcancel', micRelease);

  var voiceBtn = $('btn-voice');
  voiceBtn.addEventListener('click', function () {
    setVoiceSpeak(!voiceSpeak);
  });
  // 初始化语音回复开关状态
  try {
    setVoiceSpeak(localStorage.getItem(VOICE_KEY) === '1');
  } catch (e) { setVoiceSpeak(false); }

  // 回复完成后自动朗读（状态回到 idle 时读取最后一条 assistant 消息）
  var lastSpeakText = '';
  var origSetStatus = setStatus;
  setStatus = function (status, text) {
    origSetStatus(status, text);
    if (voiceSpeak && status === 'idle' && !voiceBusy) {
      var msgs = messagesEl.querySelectorAll('.msg.assistant .bubble');
      if (msgs.length) {
        var lastMsg = msgs[msgs.length - 1];
        var raw = lastMsg.getAttribute('data-raw') || '';
        var txt = raw || lastMsg.textContent || '';
        txt = txt.replace(/\s+/g, ' ').trim();
        if (txt && txt !== lastSpeakText) {
          lastSpeakText = txt;
          setTimeout(function () { speakText(txt); }, 300);
        }
      }
    }
  };
  inputEl.addEventListener('keyup', function (e) {
    if (e.key === '@') post('/ui/command', { line: '/at' });
  });
  inputEl.addEventListener('input', function () {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(140, inputEl.scrollHeight) + 'px';
  });
  $('btn-abort').addEventListener('click', function () { post('/ui/abort'); });
  $('btn-newchat').addEventListener('click', function () {
    post('/ui/command', { line: '/new' });
    closeSidebar();
  });
  $('btn-sidebar').addEventListener('click', function () {
    // 移动端：抽屉式滑出；桌面端：收起/展开侧边栏
    if (window.innerWidth <= 900) {
      openSidebar();
      return;
    }
    var collapsed = document.body.classList.toggle('sidebar-collapsed');
    try {
      localStorage.setItem('meowfish-sidebar', collapsed ? '0' : '1');
    } catch (e) { /* ignore */ }
  });
  $('sidebar-backdrop').addEventListener('click', closeSidebar);
  // 桌面端启动时恢复收起状态
  (function () {
    try {
      if (window.innerWidth > 900 && localStorage.getItem('meowfish-sidebar') === '0') {
        document.body.classList.add('sidebar-collapsed');
      }
    } catch (e) { /* ignore */ }
  })();
  $('btn-manage').addEventListener('click', function () {
    setManageMode(!manageMode);
    $('btn-manage').textContent = manageMode ? t('done') : t('manage');
  });
  $('btn-manage-cancel').addEventListener('click', function () {
    setManageMode(false);
    $('btn-manage').textContent = t('manage');
  });
  $('manage-select-all').addEventListener('change', function () {
    var on = this.checked;
    (meta.sessions || []).forEach(function (s) {
      if (s.id !== meta.sessionId) selected[s.id] = on;
    });
    renderSessions();
  });
  $('btn-manage-delete').addEventListener('click', function () {
    var ids = (meta.sessions || []).filter(function (s) { return selected[s.id]; }).map(function (s) { return s.id; });
    if (!ids.length) return;
    localConfirm(t('confirm-del-sessions').replace('{n}', String(ids.length)), function () {
      post('/ui/delete-sessions', { ids: ids });
      setManageMode(false);
      $('btn-manage').textContent = t('manage');
    });
  });
  $('tools-switch').addEventListener('change', function () { post('/ui/command', { line: '/tools' }); });
  $('websearch-switch').addEventListener('change', function () { post('/ui/command', { line: '/websearch' }); });
  $('btn-model').addEventListener('click', function () { post('/ui/command', { line: '/model' }); });
  $('btn-daynight').addEventListener('click', function () { post('/ui/command', { line: '/daynight' }); });
  $('btn-daynight-mob').addEventListener('click', function () { post('/ui/command', { line: '/daynight' }); });
  $('btn-theme').addEventListener('click', function () { post('/ui/command', { line: '/theme' }); });
  $('btn-menu').addEventListener('click', function () { post('/ui/command', { line: '/config' }); });
  document.querySelectorAll('#quickbar button[data-cmd]').forEach(function (btn) {
    btn.addEventListener('click', function () { post('/ui/command', { line: btn.getAttribute('data-cmd') }); });
  });
  $('modal-backdrop').addEventListener('click', function (e) {
    if (e.target === this && dialog) {
      post('/ui/close', { id: dialog.id });
      hideDialog();
    }
  });

  // 折叠交互：工具块 / 思维链块（事件委托）
  $('messages').addEventListener('click', function (e) {
    var head = e.target.closest('.tool-head, .reason-head');
    if (!head) return;
    var block = head.parentElement;
    if (block) block.classList.toggle('collapsed');
  });

  setInterval(tickAnim, 400);
  inputEl.focus();
  applyStaticI18n();

  // 启动：校验访问令牌（服务器未启用令牌时直接放行）
  fetch(withToken('/auth-check'))
    .then(function (res) {
      if (res.status === 401) {
        TOKEN = '';
        if (askToken()) location.reload();
      } else {
        connect();
      }
    })
    .catch(function () {
      connect(); // 服务器不可达时也尝试连接（SSE 会自行重试）
    });
})();
