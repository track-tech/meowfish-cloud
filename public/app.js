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
      'profile': '📝 设定', 'tools': '🛠️ 工具', 'search': '🔍 搜索', 'sshterm': '🖥️ 终端',
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
      'voice': '语音对话', 'voice-mode-title': '免提语音对话', 'voice-exit': '退出',
      'voice-listening': '聆听中…直接说话', 'voice-recording': '听到你了，请继续说…',
      'voice-working': '识别中…', 'voice-thinking': '思考中…', 'voice-speaking': '朗读中…说话可打断',
      'voice-hint': '直接说话即可 · 说完停顿会自动发送 · 朗读时开口可打断',
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
      'profile': '📝 Profile', 'tools': '🛠️ Tools', 'search': '🔍 Search', 'sshterm': '🖥️ Terminal',
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
      'voice': 'Voice chat', 'voice-mode-title': 'Hands-free Voice Chat', 'voice-exit': 'Exit',
      'voice-listening': 'Listening… just talk', 'voice-recording': 'Got it, keep talking…',
      'voice-working': 'Transcribing…', 'voice-thinking': 'Thinking…', 'voice-speaking': 'Speaking… talk to interrupt',
      'voice-hint': 'Just talk · pause to send · interrupt anytime',
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

  /* ---------- 设备隔离（云端由 HttpOnly Cookie 承载，不再放 URL；本地单用户无需该参数） ---------- */

  function withToken(path) {
    if (!TOKEN) return path;
    var q = path.indexOf('?') >= 0 ? '&' : '?';
    return path + q + 'token=' + encodeURIComponent(TOKEN);
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
    if (text === '/sshterm') openSshTerminal();
    else if (text.indexOf('/sshterm ') === 0) runInTerminal(text.slice('/sshterm '.length));
    else if (text.charAt(0) === '/') post('/ui/command', { line: text });
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
      var termCmd = '';
      var tlMatch = /^bash:\s*(.+)$/.exec(String(m.toolLabel || ''));
      if (tlMatch) termCmd = tlMatch[1];
      return (
        '<div class="msg tool collapsed' + (m.error ? ' error' : '') + '">' +
        '<div class="tool-head">' +
        '<span class="tool-caret">▸</span>' +
        '<span class="tool-label">⚙ ' + esc(m.toolLabel || '') + '</span>' +
        '<span class="tool-summary">' + esc(summary) + '</span>' +
        (termCmd ? '<button class="term-run-btn" data-cmd="' + esc(termCmd) + '" title="在 SSH 终端中执行">▶ 终端执行</button>' : '') +
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
    // 玻璃配色随主题明暗切换（深色主题下若仍用 :root 的半透明白 → 上下栏/弹窗亮得刺眼）
    if (light) {
      r.setProperty('--glass-bg', 'rgba(255, 255, 255, 0.6)');
      r.setProperty('--glass-border', 'rgba(0, 0, 0, 0.14)');
      r.setProperty('--glass-shadow', '0 8px 28px rgba(90, 75, 60, 0.16)');
    } else {
      r.setProperty('--glass-bg', 'rgba(16, 22, 38, 0.66)');
      r.setProperty('--glass-border', 'rgba(255, 255, 255, 0.12)');
      r.setProperty('--glass-shadow', '0 10px 32px rgba(0, 0, 0, 0.5)');
    }
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
  var sessionFilter = '';
  var lastSessionClick = 0; // 切换会话防抖：连点竞态保护（服务端异步加载，避免先点后到）
  var lastSessionKey = '';  // 列表渲染缓存：内容未变时不重建（避免切换会话/操作后列表闪烁）
  var lastSessionId = '';   // 当前高亮会话：仅高亮变化时局部更新，不重建列表

  function renderSessions() {
    var list = $('session-list');
    var q = sessionFilter.trim().toLowerCase();
    var items = (meta.sessions || []).slice().filter(function (s) {
      return !q || (s.title || '').toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) {
      if ((a.pinned === true) !== (b.pinned === true)) return a.pinned === true ? -1 : 1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
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
      $('btn-manage-delete').textContent = '删除' + (count ? ' (' + count + ')' : '');
    }
  }

  function setManageMode(on) {
    manageMode = on;
    selected = {};
    renderSessions();
  }

  /** 导出会话 JSON（管理模式下导出勾选项，否则全部） */
  function exportSessions() {
    var data = loadLocalData() || {};
    var sessions = Array.isArray(data.sessions) ? data.sessions : [];
    if (manageMode) {
      var ids = Object.keys(selected).filter(function (k) { return selected[k]; });
      if (ids.length) sessions = sessions.filter(function (s) { return ids.indexOf(s.id) >= 0; });
    }
    if (!sessions.length) { pushToast(t('no-sessions')); return; }
    var blob = new Blob([JSON.stringify({ app: 'meowfish', sessions: sessions }, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'meowfish-sessions-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /** 导入会话 JSON：按 id 合并进 localStorage 并上传给服务端（云端零持久化恢复） */
  function importSessions(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        var incoming = Array.isArray(parsed) ? parsed : parsed.sessions;
        if (!Array.isArray(incoming) || !incoming.length) { pushToast('文件里没有找到会话'); return; }
        var data = loadLocalData() || {};
        var sessions = Array.isArray(data.sessions) ? data.sessions.slice() : [];
        var byId = {};
        sessions.forEach(function (s) { byId[s.id] = s; });
        var added = 0;
        incoming.forEach(function (s) {
          if (s && typeof s.id === 'string' && Array.isArray(s.messages)) {
            byId[s.id] = s;
            added++;
          }
        });
        data.sessions = Object.keys(byId).map(function (id) { return byId[id]; });
        saveLocalData(data);
        post('/ui/sync', { data: data });
        pushToast('已导入 ' + added + ' 个会话');
      } catch (e) {
        pushToast('导入失败：文件不是有效 JSON');
      }
    };
    reader.readAsText(file, 'utf8');
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
        return '<button class="modal-btn" data-key="' + esc(o.key) + '">' + esc(o.label) + '</button>';
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
          // 语音对话模式：新回复开始 → 重置句子流（解析新回复的音色标记）
          if (voiceActive && voiceState === 'thinking') resetSentenceStream();
          break;
        case 'delta':
          appendDelta(m.text);
          // 语音对话模式：句子级流式朗读（生成一句、合成一句，不等整段）
          if (voiceActive && voiceState === 'thinking') feedSentenceStream(m.text);
          break;
        case 'reasonDelta':
          appendReasonDelta(m.text);
          break;
        case 'streamEnd':
          endStream();
          // 语音对话模式：回复完成 → 冲刷残余文本，全部朗读完毕回聆听
          if (voiceActive && voiceState === 'thinking') {
            if (vc && vc.suppressSpeak) {
              // 用户在等待回复时插话：旧回复不再朗读，等新回复
              vc.suppressSpeak = false;
              stopSpeak();
              sentenceQueue.length = 0;
              pendingText = '';
              setVoiceStatus(t('voice-listening'), 'listening');
              break;
            }
            var msgs = messagesEl.querySelectorAll('.msg.assistant .bubble');
            if (msgs.length) {
              var lastMsg = msgs[msgs.length - 1];
              var raw = lastMsg.getAttribute('data-raw') || lastMsg.textContent || '';
              // 剥离 {{voice: 音色|风格}} 标记（保留换行与 Markdown 结构，气泡重新渲染而不是覆写为纯文本）
              var clean = raw.replace(/\{\{\s*voice\b[^}]*\}\}/g, '').replace(/\s+/g, ' ').trim();
              lastAssistantText = clean;
              $('vv-bot-line').textContent = clean;
              var cleanRaw = raw.replace(/\{\{\s*voice\b[^}]*\}\}/g, '').trim();
              lastMsg.innerHTML = mdToHtml(esc(cleanRaw));
              lastMsg.removeAttribute('data-raw');
            }
            // 把流式切句未覆盖的残余文本也入队合成
            flushSentenceStream();
          }
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

  /* ---------- Web SSH 交互式终端（多标签 WebSocket ↔ SSH shell 通道） ---------- */

  var SSH_TERM_KEY = 'meowfish-sshterm';
  var SSH_PROFILES_KEY = 'meowfish-ssh-profiles';
  var termActive = false;
  var termTabs = [];
  var termActiveIdx = -1;
  var termSeq = 0;
  var termFormTarget = null; // 表单提交目标：null = 新建标签，否则为 tab id
  var TERM_MAX_LINES = 2000;
  var termFindQuery = '';
  var termFindIdx = 0;
  var termPendingInput = '';
  var TERM_GEOM_KEY = 'meowfish-sshterm-geom';
  var termMax = false;
  var termMinimized = false;

  function activeTerm() { return termTabs[termActiveIdx] || null; }

  function loadSshTermConfig() {
    try {
      var raw = localStorage.getItem(SSH_TERM_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSshTermConfig(cfg) {
    try { localStorage.setItem(SSH_TERM_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }
  /** SSH 连接档案列表：主机/凭据复用（仅本浏览器 localStorage） */
  function loadSshProfiles() {
    try {
      var raw = localStorage.getItem(SSH_PROFILES_KEY);
      if (!raw) return [];
      var list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }
  function saveSshProfiles(list) {
    try { localStorage.setItem(SSH_PROFILES_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }
  function upsertSshProfile(cfg) {
    if (!cfg || !cfg.profileName) return;
    var list = loadSshProfiles();
    var prof = {
      name: cfg.profileName,
      host: cfg.host,
      port: Number(cfg.port) || 22,
      user: cfg.user,
      authKind: cfg.authKind === 'key' ? 'key' : 'password',
      password: cfg.password || '',
      privateKey: cfg.privateKey || '',
      fingerprint: cfg.fingerprint || '',
    };
    var idx = list.findIndex(function (p) { return p.name === prof.name; });
    if (idx >= 0) list[idx] = prof; else list.push(prof);
    saveSshProfiles(list);
  }
  function deleteSshProfile(name) {
    saveSshProfiles(loadSshProfiles().filter(function (p) { return p.name !== name; }));
  }
  /** 从机器人配置（/ssh 表单，config.ssh）读取连接参数：让终端与工具使用同一份凭据 */
  function loadAppSshConfig() {
    try {
      var c = loadLocalConfig();
      if (c && c.ssh && c.ssh.host) {
        return {
          host: c.ssh.host,
          port: Number(c.ssh.port) || 22,
          user: c.ssh.user || 'root',
          authKind: c.ssh.authKind === 'key' ? 'key' : 'password',
          password: c.ssh.password || '',
          privateKey: c.ssh.privateKey || '',
          fingerprint: c.ssh.fingerprint || '',
        };
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  /** 终端连接成功/指纹更新后，把同一份 SSH 配置同步进机器人 config.ssh（localStorage + Worker） */
  function syncTermConfigToApp(cfg) {
    try {
      var appCfg = loadLocalConfig() || {};
      appCfg.ssh = {
        host: cfg.host,
        port: Number(cfg.port) || 22,
        user: cfg.user,
        authKind: cfg.authKind === 'key' ? 'key' : 'password',
        password: cfg.password || '',
        privateKey: cfg.privateKey || '',
        fingerprint: cfg.fingerprint || '',
      };
      saveLocalConfig(appCfg);
      post('/ui/local-config', { config: appCfg });
    } catch (e) { /* ignore */ }
  }

  function termCols() {
    var screen = $('ssh-term-screen');
    var w = screen ? screen.clientWidth : window.innerWidth;
    return Math.max(20, Math.min(500, Math.floor((w - 24) / 8.4)));
  }
  function termRows() {
    var screen = $('ssh-term-screen');
    var h = screen ? screen.clientHeight : window.innerHeight;
    return Math.max(5, Math.min(200, Math.floor((h - 20) / 19)));
  }

  function newTermTab(cfg) {
    return {
      id: ++termSeq,
      cfg: cfg,
      title: cfg.profileName || cfg.user + '@' + cfg.host,
      ws: null,
      connected: false,
      statusText: '未连接',
      statusCls: '',
      lines: [[]], row: 0, col: 0, cls: '', renderPending: false,
      pingTimer: null,
      pongAt: 0,
      reconnectTries: 0,
      reconnectTimer: null,
      pendingInput: '',
    };
  }

  function termStatus(tab, text, cls) {
    tab.statusText = text;
    tab.statusCls = cls || '';
    if (tab === activeTerm()) renderTermStatus();
  }
  function renderTermStatus() {
    var t = activeTerm();
    var el = $('ssh-term-status');
    el.textContent = t ? t.statusText : '未连接';
    el.className = 'ssh-term-status' + (t && t.statusCls ? ' ' + t.statusCls : '');
  }

  function termEnsureLine(tab) {
    while (tab.lines.length <= tab.row) tab.lines.push([]);
  }
  function termPut(tab, ch) {
    termEnsureLine(tab);
    var line = tab.lines[tab.row];
    if (tab.col >= line.length) line.push({ ch: ch, cls: tab.cls });
    else line[tab.col] = { ch: ch, cls: tab.cls };
    tab.col++;
  }
  function termClearToEnd(tab) {
    termEnsureLine(tab);
    tab.lines[tab.row] = tab.lines[tab.row].slice(0, tab.col);
  }
  function termClearLine(tab) {
    termEnsureLine(tab);
    tab.lines[tab.row] = [];
    tab.col = 0;
  }
  function termClearScreen(tab) {
    tab.lines = [[]];
    tab.row = 0;
    tab.col = 0;
  }
  function termTrimLines(tab) {
    if (tab.lines.length <= TERM_MAX_LINES) return;
    tab.lines = tab.lines.slice(tab.lines.length - TERM_MAX_LINES);
    tab.row = Math.min(tab.row, tab.lines.length - 1);
  }
  function termHtml(tab) {
    var q = termFindQuery.trim();
    return tab.lines.map(function (line) {
      if (!q) {
        return '<span>' + line.map(function (c) {
          var body = esc(c.ch);
          return c.cls ? '<span class="' + c.cls + '">' + body + '</span>' : body;
        }).join('') + '</span>';
      }
      // 搜索模式：优先保证命中高亮（暂以纯文本渲染）
      var text = line.map(function (c) { return c.ch; }).join('');
      var out = '';
      var lower = text.toLowerCase();
      var ql = q.toLowerCase();
      var from = 0;
      var idx = lower.indexOf(ql);
      while (idx >= 0) {
        out += esc(text.slice(from, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>';
        from = idx + q.length;
        idx = lower.indexOf(ql, from);
      }
      out += esc(text.slice(from));
      return '<span>' + out + '</span>';
    }).join('\n');
  }
  function termFindMatches() {
    var t = activeTerm();
    var q = termFindQuery.trim();
    var out = [];
    if (!t || !q) return out;
    var ql = q.toLowerCase();
    t.lines.forEach(function (line, li) {
      var text = line.map(function (c) { return c.ch; }).join('');
      var lower = text.toLowerCase();
      var from = 0;
      var idx = lower.indexOf(ql);
      while (idx >= 0) {
        out.push({ line: li, start: idx, end: idx + q.length });
        from = idx + q.length;
        idx = lower.indexOf(ql, from);
      }
    });
    return out;
  }
  function termFindGo(step) {
    var matches = termFindMatches();
    if (!matches.length) return;
    termFindIdx = (termFindIdx + matches.length + step) % matches.length;
    var el = $('ssh-term-output');
    if (!el) return;
    var marks = el.querySelectorAll('mark');
    var m = marks[termFindIdx];
    if (m) m.scrollIntoView({ block: 'center' });
    renderTermStatus();
  }
  function termRunFind(query) {
    termFindQuery = String(query || '');
    termFindIdx = 0;
    var t = activeTerm();
    if (t) renderTermBuffer(t);
    termFindGo(0);
  }
  function termFindStep(step) {
    termFindGo(step);
  }
  function termFindToggle() {
    var bar = $('ssh-term-findbar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) {
      $('ssh-term-find-input').value = termFindQuery;
      $('ssh-term-find-input').focus();
    }
  }
  function termFindClose() {
    termFindQuery = '';
    termFindIdx = 0;
    $('ssh-term-findbar').classList.add('hidden');
    var t = activeTerm();
    if (t) renderTermBuffer(t);
  }
  function termRender(tab) {
    if (tab.renderPending) return;
    tab.renderPending = true;
    requestAnimationFrame(function () {
      tab.renderPending = false;
      if (tab !== activeTerm()) return; // 非活动标签只更新缓冲，切回时重绘
      var el = $('ssh-term-output');
      if (!el) return;
      el.innerHTML = termHtml(tab);
      var screen = $('ssh-term-screen');
      if (screen) screen.scrollTop = screen.scrollHeight;
    });
  }
  function renderTermBuffer(tab) {
    if (!tab) return;
    var el = $('ssh-term-output');
    if (!el) return;
    el.innerHTML = termHtml(tab);
    var screen = $('ssh-term-screen');
    if (screen) screen.scrollTop = screen.scrollHeight;
  }
  function termApplyCsi(tab, params, cmd) {
    var parts = params.length ? params.split(';') : [];
    var p0 = parts[0] ? parseInt(parts[0], 10) : 0;
    var p1 = parts[1] ? parseInt(parts[1], 10) : 0;
    if (isNaN(p0)) p0 = 0;
    if (isNaN(p1)) p1 = 0;
    if (cmd === 'm') {
      if (!parts.length || p0 === 0) { tab.cls = ''; return; }
      var cls = tab.cls.split(' ').filter(Boolean);
      for (var i = 0; i < parts.length; i++) {
        var n = parseInt(parts[i], 10);
        if (n === 0) { cls = []; continue; }
        if (n === 1) cls.push('b');
        else if (n >= 30 && n <= 37) cls.push('c' + n);
        else if (n >= 90 && n <= 97) cls.push('c' + n);
        else if (n === 39) cls = cls.filter(function (x) { return !/^c\d+$/.test(x); });
      }
      tab.cls = cls.join(' ');
      return;
    }
    if (cmd === 'K') { if (p0 === 2) termClearLine(tab); else termClearToEnd(tab); return; }
    if (cmd === 'J') { if (p0 === 2 || p0 === 3) termClearScreen(tab); return; }
    if (cmd === 'H' || cmd === 'f') { tab.row = Math.max(0, (p0 || 1) - 1); tab.col = Math.max(0, (p1 || 1) - 1); termEnsureLine(tab); return; }
    if (cmd === 'A') tab.row = Math.max(0, tab.row - (p0 || 1));
    else if (cmd === 'B') tab.row = tab.row + (p0 || 1);
    else if (cmd === 'C') tab.col = tab.col + (p0 || 1);
    else if (cmd === 'D') tab.col = Math.max(0, tab.col - (p0 || 1));
    else if (cmd === 'G') tab.col = Math.max(0, p0 - 1);
    else if (cmd === 'd') { tab.row = Math.max(0, p0 - 1); termEnsureLine(tab); }
    termTrimLines(tab);
  }
  function termWrite(tab, text) {
    var i = 0;
    while (i < text.length) {
      var ch = text.charAt(i++);
      if (ch === '\r') { tab.col = 0; continue; }
      if (ch === '\n') { tab.row++; tab.col = 0; termTrimLines(tab); continue; }
      if (ch === '\b') { if (tab.col > 0) tab.col--; continue; }
      if (ch === '\t') { tab.col = (Math.floor(tab.col / 8) + 1) * 8; continue; }
      if (ch === '\x1b') {
        if (text.charAt(i) === '[') {
          var j = i + 1;
          var params = '';
          while (j < text.length && /[0-9;?]/.test(text.charAt(j))) params += text.charAt(j++);
          if (text.charAt(j) !== undefined) termApplyCsi(tab, params, text.charAt(j++));
          i = j;
          continue;
        }
        if (text.charAt(i) === ']') {
          var k = text.indexOf('\x07', i);
          i = k < 0 ? text.length : k + 1;
          continue;
        }
        continue;
      }
      termPut(tab, ch);
    }
    termRender(tab);
  }

  function termSend(data) {
    var t = activeTerm();
    if (t && t.ws && t.connected) t.ws.send(JSON.stringify({ type: 'input', data: data }));
  }
  function closeTabWs(tab) {
    if (tab.pingTimer) { clearInterval(tab.pingTimer); tab.pingTimer = null; }
    if (tab.reconnectTimer) { clearTimeout(tab.reconnectTimer); tab.reconnectTimer = null; }
    if (tab.ws) {
      try { tab.ws.close(); } catch (e) { /* ignore */ }
      tab.ws = null;
    }
    tab.connected = false;
  }

  function connectTermTab(tab, cfg) {
    closeTabWs(tab);
    tab.cfg = cfg;
    tab.title = cfg.profileName || cfg.user + '@' + cfg.host;
    termClearScreen(tab);
    termStatus(tab, '连接中…', '');
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    var ws;
    try {
      ws = new WebSocket(proto + location.host + withToken('/ssh-term'));
    } catch (e) {
      termStatus(tab, 'WebSocket 不可用', 'err');
      return;
    }
    tab.ws = ws;
    ws.onopen = function () {
      ws.send(JSON.stringify({ type: 'connect', cfg: cfg, cols: termCols(), rows: termRows() }));
    };
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (err) { return; }
      if (m.type === 'ready') {
        tab.connected = true;
        tab.reconnectTries = 0;
        tab.pongAt = Date.now();
        termStatus(tab, cfg.user + '@' + cfg.host + ':' + (cfg.port || 22), 'on');
        // 连接成功：保存连接档案 + 同步给机器人工具（/ssh 同款 config.ssh）
        upsertSshProfile(cfg);
        syncTermConfigToApp(cfg);
        if (tab.pendingInput) {
          var pending = tab.pendingInput;
          tab.pendingInput = '';
          ws.send(JSON.stringify({ type: 'input', data: pending + '\r' }));
        }
        // keepalive：20s 一个 ping；长时间无 pong 认为连接僵死，交给 onclose 自动重连
        if (!tab.pingTimer) {
          tab.pingTimer = setInterval(function () {
            if (!tab.ws || !tab.connected) return;
            try { tab.ws.send(JSON.stringify({ type: 'ping' })); } catch (e) { /* ignore */ }
            if (Date.now() - tab.pongAt > 75_000) {
              try { tab.ws.close(); } catch (e) { /* ignore */ }
            }
          }, 20_000);
        }
      } else if (m.type === 'pong') {
        tab.pongAt = Date.now();
      } else if (m.type === 'fingerprint' && m.fingerprint) {
        if (!cfg.fingerprint) {
          cfg.fingerprint = m.fingerprint;
          saveSshTermConfig(cfg);
        }
        upsertSshProfile(cfg);
        syncTermConfigToApp(cfg);
      } else if (m.type === 'data') {
        termWrite(tab, m.data);
      } else if (m.type === 'error') {
        tab.connected = false;
        termStatus(tab, String(m.message || '连接失败'), 'err');
        termWrite(tab, '\r\n[' + String(m.message || '连接失败') + ']\r\n');
      } else if (m.type === 'exit') {
        tab.connected = false;
        termStatus(tab, '已退出（code ' + m.code + '）', 'err');
      }
    };
    ws.onclose = function () {
      tab.connected = false;
      if (tab.pingTimer) { clearInterval(tab.pingTimer); tab.pingTimer = null; }
      // 终端还开着且标签仍存在：自动重连（最多 5 次，指数退避）
      if (termActive && termTabs.indexOf(tab) >= 0 && tab.reconnectTries < 5) {
        tab.reconnectTries++;
        var delay = Math.min(6000, 800 * Math.pow(2, tab.reconnectTries - 1));
        if (tab === activeTerm()) termStatus(tab, '连接已断开，' + Math.round(delay / 1000) + 's 后重连…', 'err');
        tab.reconnectTimer = setTimeout(function () {
          if (termActive && termTabs.indexOf(tab) >= 0) connectTermTab(tab, tab.cfg);
        }, delay);
        return;
      }
      if (tab === activeTerm()) termStatus(tab, '连接已断开（点击「重连」重试）', 'err');
    };
    ws.onerror = function () {
      tab.connected = false;
      if (tab === activeTerm()) termStatus(tab, '连接错误', 'err');
    };
  }

  function reconnectActiveTerm() {
    var t = activeTerm();
    if (!t) return;
    t.reconnectTries = 0;
    renderTermTabs();
    connectTermTab(t, t.cfg);
  }

  function renderTermTabs() {
    var el = $('ssh-term-tabs');
    if (!el) return;
    el.innerHTML = termTabs.map(function (t, i) {
      return '<button type="button" class="ssh-term-tab' + (i === termActiveIdx ? ' active' : '') + '" data-i="' + i + '">' +
        '<span class="tab-label">' + esc(t.title) + '</span>' +
        '<span class="tab-close" data-close="' + i + '" title="关闭">×</span></button>';
    }).join('');
    el.querySelectorAll('.ssh-term-tab').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        var i = Number(btn.getAttribute('data-i'));
        if (e.target.closest('.tab-close')) closeTermTab(i);
        else switchTermTab(i);
      });
    });
  }

  function switchTermTab(i) {
    if (i < 0 || i >= termTabs.length) return;
    termActiveIdx = i;
    renderTermTabs();
    renderTermStatus();
    renderTermBuffer(activeTerm());
    termInputEl().focus();
  }

  function closeTermTab(i) {
    var tab = termTabs[i];
    if (!tab) return;
    closeTabWs(tab);
    termTabs.splice(i, 1);
    if (!termTabs.length) {
      termActiveIdx = -1;
      exitSshTerminal();
      return;
    }
    if (i < termActiveIdx) termActiveIdx--;
    else if (i === termActiveIdx) termActiveIdx = Math.min(i, termTabs.length - 1);
    renderTermTabs();
    renderTermStatus();
    renderTermBuffer(activeTerm());
  }

  function addTermTab(cfg) {
    var tab = newTermTab(cfg);
    tab.pendingInput = termPendingInput;
    termPendingInput = '';
    termTabs.push(tab);
    termActiveIdx = termTabs.length - 1;
    if (!termActive) showTermView();
    else {
      renderTermTabs();
      renderTermStatus();
    }
    renderTermBuffer(tab);
    connectTermTab(tab, cfg);
  }

  /** ＋ 新建连接：直接复用当前标签配置（或最近成功配置），像桌面终端一样秒开，不再弹窗 */
  function openNewTermTab() {
    var t = activeTerm();
    var cfg = t ? t.cfg : (loadAppSshConfig() || loadSshTermConfig());
    if (!cfg) { openSshTermForm(true); return; }
    var copy = {
      host: cfg.host,
      port: Number(cfg.port) || 22,
      user: cfg.user,
      authKind: cfg.authKind === 'key' ? 'key' : 'password',
      password: cfg.password || '',
      privateKey: cfg.privateKey || '',
      fingerprint: cfg.fingerprint || '',
      profileName: cfg.profileName || '',
    };
    addTermTab(copy);
  }

  function loadTermGeom() {
    try {
      var g = JSON.parse(localStorage.getItem(TERM_GEOM_KEY) || 'null');
      if (g && typeof g.x === 'number' && typeof g.y === 'number' && typeof g.w === 'number' && typeof g.h === 'number') return g;
    } catch (e) { /* ignore */ }
    return null;
  }
  function saveTermGeom() {
    if (termMax) return;
    try {
      var v = $('ssh-term-view');
      var r = v.getBoundingClientRect();
      if (r.width > 100 && r.height > 100) {
        localStorage.setItem(TERM_GEOM_KEY, JSON.stringify({ x: r.left, y: r.top, w: r.width, h: r.height }));
      }
    } catch (e) { /* ignore */ }
  }
  function clampTermGeom() {
    var v = $('ssh-term-view');
    if (!v || termMax) return;
    var r = v.getBoundingClientRect();
    var w = Math.min(r.width, window.innerWidth - 16);
    var h = Math.min(r.height, window.innerHeight - 16);
    var x = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    var y = Math.max(8, Math.min(r.top, window.innerHeight - h - 8));
    if (w !== r.width) v.style.width = w + 'px';
    if (h !== r.height) v.style.height = h + 'px';
    v.style.left = x + 'px';
    v.style.top = y + 'px';
  }
  function applyTermGeom() {
    var v = $('ssh-term-view');
    var g = loadTermGeom();
    if (g) {
      v.style.left = g.x + 'px';
      v.style.top = g.y + 'px';
      v.style.width = g.w + 'px';
      v.style.height = g.h + 'px';
    } else {
      v.style.left = '';
      v.style.top = '';
      v.style.width = '';
      v.style.height = '';
    }
    clampTermGeom();
  }
  function toggleTermMax() {
    var v = $('ssh-term-view');
    termMax = !termMax;
    v.classList.toggle('max', termMax);
    if (!termMax) applyTermGeom();
  }
  /** 最小化：窗口隐藏但所有 SSH 连接保持，右下角留一个悬浮按钮恢复 */
  function minimizeTermWindow() {
    if (!termActive) return;
    saveTermGeom();
    termActive = false;
    termMinimized = true;
    $('ssh-term-view').classList.add('hidden');
    document.body.classList.remove('term-active');
    $('ssh-term-minibutton').classList.remove('hidden');
  }
  function restoreTermWindow() {
    termMinimized = false;
    termActive = true;
    $('ssh-term-minibutton').classList.add('hidden');
    $('ssh-term-view').classList.remove('hidden');
    document.body.classList.add('term-active');
    applyTermGeom();
    renderTermTabs();
    renderTermStatus();
    if (activeTerm()) renderTermBuffer(activeTerm());
    termInputEl().focus();
  }

  function showTermView() {
    termActive = true;
    termMinimized = false;
    $('ssh-term-minibutton').classList.add('hidden');
    $('ssh-term-view').classList.remove('hidden');
    document.body.classList.add('term-active');
    applyTermGeom();
    renderTermTabs();
    renderTermStatus();
    if (activeTerm()) renderTermBuffer(activeTerm());
    termInputEl().focus();
  }
  function termInputEl() { return $('ssh-term-input'); }
  function exitSshTerminal() {
    saveTermGeom();
    termActive = false;
    termMinimized = false;
    $('ssh-term-minibutton').classList.add('hidden');
    termTabs.forEach(function (t) { closeTabWs(t); });
    termTabs = [];
    termActiveIdx = -1;
    $('ssh-term-view').classList.add('hidden');
    document.body.classList.remove('term-active');
    inputEl.focus();
  }
  function clearActiveTerm() {
    var t = activeTerm();
    if (!t) return;
    termClearScreen(t);
    renderTermBuffer(t);
    termSend('\x0c');
  }
  /** 把一条命令送进终端执行：已连接直接执行；否则打开/新建标签并在连接成功后执行 */
  function runInTerminal(command) {
    command = String(command || '').trim();
    if (!command) return;
    var t = activeTerm();
    if (termActive && t) {
      if (t.connected) termSend(command + '\r');
      else { t.pendingInput = command; termStatus(t, '连接成功后自动执行: ' + command, ''); }
      return;
    }
    termPendingInput = command;
    var cfg = loadAppSshConfig() || loadSshTermConfig();
    if (cfg) addTermTab(cfg);
    else openSshTermForm(true);
  }
  /** 把当前标签最近 40 行输出放进聊天输入框，交给你发送给喵鱼 */
  function sendActiveTermToBot() {
    var t = activeTerm();
    if (!t) return;
    var text = t.lines.slice(-40).map(function (line) {
      return line.map(function (c) { return c.ch; }).join('');
    }).join('\n').replace(/\s+$/, '');
    if (!text) { pushToast('终端还没有输出'); return; }
    var title = t.title;
    exitSshTerminal();
    inputEl.value = '[终端输出 ' + title + ']\n' + text + '\n[/终端输出]\n';
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(140, inputEl.scrollHeight) + 'px';
    inputEl.focus();
  }

  function openSshTermForm(isNew) {
    var target = isNew ? null : (termTabs.find(function (t) { return t.id === termFormTarget; }) || activeTerm());
    termFormTarget = target ? target.id : null;
    var cfg = target ? target.cfg : (loadAppSshConfig() || loadSshTermConfig() || { host: '', port: 22, user: 'root', authKind: 'password', password: '' });
    var profiles = loadSshProfiles();
    var profOptions = '<option value="">— 新连接 —</option>' + profiles.map(function (p) {
      return '<option value="' + esc(p.name) + '">' + esc(p.name) + '（' + esc(p.user) + '@' + esc(p.host) + '）</option>';
    }).join('');
    $('modal-backdrop').classList.remove('hidden');
    $('modal-title').textContent = isNew || !target ? 'SSH 终端连接' : 'SSH 终端连接设置';
    $('modal-filter').classList.add('hidden');
    var body = $('modal-body');
    var actions = $('modal-actions');
    body.innerHTML =
      '<label class="form-field"><span>配置档案</span><select id="stf-profile">' + profOptions + '</select></label>' +
      '<label class="form-field"><span>档案名（保存后下次可直接选择）</span><input type="text" id="stf-name" value="' + esc(cfg.profileName || '') + '" placeholder="例如：家里服务器 / 公司开发机"></label>' +
      '<label class="form-field"><span>主机</span><input type="text" id="stf-host" value="' + esc(cfg.host) + '" placeholder="user@host 或 host"></label>' +
      '<label class="form-field"><span>端口</span><input type="number" id="stf-port" value="' + esc(String(cfg.port || 22)) + '"></label>' +
      '<label class="form-field"><span>用户名</span><input type="text" id="stf-user" value="' + esc(cfg.user) + '"></label>' +
      '<label class="form-field"><span>认证方式</span><select id="stf-auth"><option value="password">密码</option><option value="key">私钥（ed25519）</option></select></label>' +
      '<label class="form-field" id="stf-pw"><span>密码</span><input type="password" id="stf-password" value="' + esc(cfg.password || '') + '"></label>' +
      '<label class="form-field hidden" id="stf-key"><span>私钥（OpenSSH ed25519）</span><textarea rows="4" id="stf-key-text" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----">' + esc(cfg.privateKey || '') + '</textarea></label>';
    actions.innerHTML = '<button class="modal-btn primary" id="dlg-submit" type="button">连接</button><button class="modal-btn" id="dlg-profile-del" type="button">删除档案</button><button class="modal-btn" id="dlg-cancel" type="button">' + t('cancel') + '</button>';
    function syncAuth() {
      var key = $('stf-auth').value === 'key';
      $('stf-pw').classList.toggle('hidden', key);
      $('stf-key').classList.toggle('hidden', !key);
    }
    function fillFromProfile(name) {
      var p = profiles.find(function (x) { return x.name === name; });
      if (!p) return;
      $('stf-name').value = p.name;
      $('stf-host').value = p.host;
      $('stf-port').value = String(p.port || 22);
      $('stf-user').value = p.user;
      $('stf-auth').value = p.authKind === 'key' ? 'key' : 'password';
      $('stf-password').value = p.password || '';
      $('stf-key-text').value = p.privateKey || '';
      syncAuth();
    }
    if (cfg.profileName) $('stf-profile').value = cfg.profileName;
    $('stf-profile').addEventListener('change', function () { if (this.value) fillFromProfile(this.value); });
    $('stf-auth').addEventListener('change', syncAuth);
    syncAuth();
    $('dlg-cancel').addEventListener('click', hideDialog);
    $('dlg-profile-del').addEventListener('click', function () {
      var name = $('stf-profile').value || $('stf-name').value.trim();
      if (!name) { pushToast('请先选择或填写档案名'); return; }
      deleteSshProfile(name);
      profiles = loadSshProfiles();
      $('stf-profile').innerHTML = '<option value="">— 新连接 —</option>' + profiles.map(function (p) {
        return '<option value="' + esc(p.name) + '">' + esc(p.name) + '（' + esc(p.user) + '@' + esc(p.host) + '）</option>';
      }).join('');
      if ($('stf-name').value === name) $('stf-name').value = '';
      pushToast('档案已删除');
    });
    $('dlg-submit').addEventListener('click', function () {
      var host = $('stf-host').value.trim();
      var user = $('stf-user').value.trim();
      var authKind = $('stf-auth').value;
      var profileName = $('stf-name').value.trim();
      // 允许把 user@host 整体填在主机栏
      if (!user && host.indexOf('@') > 0) {
        var at = host.indexOf('@');
        user = host.slice(0, at);
        host = host.slice(at + 1);
        $('stf-user').value = user;
        $('stf-host').value = host;
      }
      if (!host || !user) { pushToast('请填写主机与用户名'); return; }
      var password = authKind === 'password' ? $('stf-password').value : '';
      var privateKey = authKind === 'key' ? $('stf-key-text').value.trim() : '';
      if (authKind === 'password' && !password) { pushToast('请填写密码'); return; }
      if (authKind === 'key' && !privateKey.includes('PRIVATE KEY')) {
        pushToast('请粘贴完整的 OpenSSH ed25519 私钥（-----BEGIN OPENSSH PRIVATE KEY-----…）');
        return;
      }
      var next = {
        host: host, port: parseInt($('stf-port').value, 10) || 22, user: user,
        authKind: authKind,
        password: password,
        privateKey: privateKey,
        fingerprint: cfg.fingerprint || '',
        profileName: profileName || cfg.profileName || '',
      };
      saveSshTermConfig(next);
      hideDialog();
      var targetId = termFormTarget;
      termFormTarget = null;
      if (targetId) {
        var idx = termTabs.findIndex(function (t) { return t.id === targetId; });
        if (idx >= 0) {
          var tab = termTabs[idx];
          tab.cfg = next;
          tab.title = next.profileName || next.user + '@' + next.host;
          switchTermTab(idx);
          connectTermTab(tab, next);
          return;
        }
      }
      addTermTab(next);
    });
  }

  function openSshTerminal() {
    if (termMinimized) { restoreTermWindow(); return; }
    if (termActive) { termInputEl().focus(); return; }
    // 机器人 /ssh 配置优先：终端与工具始终共用同一份凭据
    var cfg = loadAppSshConfig() || loadSshTermConfig();
    if (cfg) saveSshTermConfig(cfg);
    if (!cfg) { openSshTermForm(true); return; }
    addTermTab(cfg);
  }

  /* ---------- 免提连续语音对话（OpenAI Realtime 式体验 · DeepSeek + MiMo） ---------- */

  var speechKey = '';                     // MiMo key：请求头带上（本地服务端 secrets 兜底）
  var audioCtx = null;                    // 播放用 AudioContext（进入语音模式时创建）
  var vcMicCtx = null;                    // 16kHz 采集 AudioContext（必须在用户手势内创建，否则 suspended → VAD 永远静音）
  var voiceActive = false;                // 语音对话模式是否激活
  var voiceState = 'off';                 // off | listening | recording | transcribing | thinking | speaking
  var micRms = 0;                         // 麦克风实时音量（0~1，动效用）
  var playRms = 0;                        // 播放实时音量（0~1，动效用）
  var vc = null;                          // 语音对话运行时句柄 { micCtx, proc, micStream, recChunks, segStart, vadTh, ... }
  var speakQueue = [];                    // 待播放 AudioBuffer 队列
  var speakSource = null;                 // 当前播放源
  var playAnalyser = null;                // 播放音量分析（动效用）
  var lastAssistantText = '';             // 最近一次朗读/应朗读的助手文本
  var lastVoiceText = '';                 // 最近一次识别文本（字幕回显）

  try {
    var _lc = loadLocalConfig();
    if (_lc && _lc.general && typeof _lc.general.mimoKey === 'string') speechKey = _lc.general.mimoKey;
  } catch (e) { /* ignore */ }

  function voiceHeaders() {
    var h = { 'Content-Type': 'application/json' };
    if (speechKey) h['x-mimo-key'] = speechKey;
    return h;
  }

  function setVoiceStatus(text, state) {
    voiceState = state;
    $('voice-status').textContent = text;
    $('voice-status').className = 'vv-status vs-' + state;
  }

  /* ---- 进入 / 退出语音对话模式 ---- */
  function enterVoiceMode() {
    if (voiceActive) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      pushToast(t('mic-fail') + 'getUserMedia unavailable');
      return;
    }
    // 用户手势内同步创建两个 AudioContext（绕过自动播放策略：异步回调里创建会 suspended，VAD 全零 → 卡聆听）
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        playAnalyser = audioCtx.createAnalyser();
        playAnalyser.fftSize = 256;
        playAnalyser.connect(audioCtx.destination);
      }
      if (audioCtx.state === 'suspended') void audioCtx.resume();
      if (!vcMicCtx || vcMicCtx.state === 'closed') vcMicCtx = new AudioContext({ sampleRate: 16000 });
      if (vcMicCtx.state === 'suspended') void vcMicCtx.resume();
    } catch (e) {
      pushToast(t('voice-fail') + (e instanceof Error ? e.message : ''));
      return;
    }
    voiceActive = true;
    document.body.classList.add('voice-active');
    $('btn-voice').classList.add('on');
    $('voice-view').classList.remove('hidden');
    $('vv-hint').textContent = t('voice-hint');
    // 通知服务端进入语音对话模式：注入语音规则（口语化 + 输出 {{voice}} 标记）
    post('/ui/command', { line: '/voice' });
    lastVoiceText = '';
    lastAssistantText = '';
    $('vv-user-line').textContent = '';
    $('vv-bot-line').textContent = '';
    setVoiceStatus(t('voice-listening'), 'listening');
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (s) {
        if (!voiceActive) {
          s.getTracks().forEach(function (t) { t.stop(); });
          return;
        }
        // 16kHz 单声道采集（ScriptProcessor 收集 PCM；VAD 与动效直接从 chunks 算音量）
        var src = vcMicCtx.createMediaStreamSource(s);
        var proc = vcMicCtx.createScriptProcessor(2048, 1, 1);
        var mute = vcMicCtx.createGain();
        mute.gain.value = 0; // 采集不播放（防回授）
        vc = {
          micCtx: vcMicCtx, proc, micStream: s,
          recChunks: [], segStart: 0, vadSpeech: 0, vadSilence: 0,
          vadTh: 0.008, noiseSamples: 0, noiseSum: 0, segLen: 0, busy: false, suppressSpeak: false,
        };
        src.connect(proc);
        proc.connect(mute);
        mute.connect(vcMicCtx.destination);
        proc.onaudioprocess = function (e) {
          if (!voiceActive) return;
          vc.recChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
          vc.segLen += e.inputBuffer.getChannelData(0).length;
        };
        startVadLoop();
      })
      .catch(function (e) {
        voiceActive = false;
        document.body.classList.remove('voice-active');
        $('voice-view').classList.add('hidden');
        $('btn-voice').classList.remove('on');
        pushToast(t('mic-fail') + (e instanceof Error ? e.message : String(e)));
      });
  }

  function exitVoiceMode() {
    voiceActive = false;
    stopSpeak();
    stopVadLoop();
    sentenceQueue.length = 0;
    pendingText = '';
    // 通知服务端退出语音对话模式
    post('/ui/command', { line: '/voice off' });
    if (vc) {
      try { vc.proc.disconnect(); } catch (e) { /* ignore */ }
      try { vc.micStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* ignore */ }
      vc = null;
    }
    if (vcMicCtx) {
      try { vcMicCtx.close(); } catch (e) { /* ignore */ }
      vcMicCtx = null;
    }
    document.body.classList.remove('voice-active');
    $('voice-view').classList.add('hidden');
    $('btn-voice').classList.remove('on');
    setVoiceStatus('', 'off');
  }

  /* ---- VAD 循环：每 100ms 算音量，驱动状态机 + 动效 ---- */
  var vadTimer = null;
  var rafTimer = null;

  function startVadLoop() {
    stopVadLoop();
    vadTimer = setInterval(vadTick, 100);
    rafTimer = requestAnimationFrame(drawVoiceAnim);
  }
  function stopVadLoop() {
    if (vadTimer) { clearInterval(vadTimer); vadTimer = null; }
    if (rafTimer) { cancelAnimationFrame(rafTimer); rafTimer = null; }
  }

  function vadTick() {
    if (!voiceActive || !vc) return;
    // 空闲/朗读/思考阶段只保留最近 8s（80 块）用于 VAD 回看与噪底估计：
    // 防止长期挂机时 recChunks 无界增长（recording 阶段有 15s 上限与断句裁剪，不在此修剪）
    if (voiceState !== 'recording' && vc.recChunks.length > 80) {
      var dropCount = vc.recChunks.length - 80;
      vc.recChunks.splice(0, dropCount);
      vc.segStart = Math.max(0, vc.segStart - dropCount);
    }
    // 直接从最近采集的 PCM 算音量：RMS（动效）+ peak（VAD，更灵敏）
    var chunks = vc.recChunks;
    var tailSamples = 1600; // 最近 0.1s（16kHz）
    var sum = 0, n = 0, peak = 0;
    for (var ci = chunks.length - 1; ci >= 0 && n < tailSamples; ci--) {
      var c = chunks[ci];
      for (var si = c.length - 1; si >= 0 && n < tailSamples; si--) {
        var v = c[si];
        sum += v * v;
        var av = v < 0 ? -v : v;
        if (av > peak) peak = av;
        n++;
      }
    }
    micRms = n ? Math.sqrt(sum / n) : 0;
    // 软增益：普通麦克风音量偏小，放大后 VAD 与动效都更跟手
    var gain = 2.2;
    micRms = Math.min(1, micRms * gain);
    var effPeak = Math.min(1, peak * gain);
    // 读播放音量（动效：朗读时圆环跟随声音）
    if (playAnalyser) {
      var pdata = new Float32Array(playAnalyser.fftSize);
      playAnalyser.getFloatTimeDomainData(pdata);
      var psum = 0;
      for (var j = 0; j < pdata.length; j++) psum += pdata[j] * pdata[j];
      playRms = Math.sqrt(psum / pdata.length) * 1.6; // 播放源音量较小，放大一点
      if (playRms > 1) playRms = 1;
    }
    // 自适应底噪：前 0.8s 采集，阈值 = max(0.008, 底噪*2.5)
    if (vc.noiseSamples < 8) {
      vc.noiseSum += micRms;
      vc.noiseSamples++;
      if (vc.noiseSamples >= 8) {
        var noise = vc.noiseSum / 8;
        vc.vadTh = Math.max(0.008, noise * 2.5);
      }
      return;
    }
    var th = vc.vadTh;
    // 语音判定：peak 超阈值即算有声（比纯 RMS 灵敏，远麦轻声也能触发）
    // speaking 时用更严阈值：麦克风音量需明显盖过扬声器（防外放回声自我打断）
    var speakTh = voiceState === 'speaking' ? Math.max(th, playRms * 1.8, 0.03) : th;
    var voiced = effPeak > speakTh || micRms > speakTh * 0.7;
    if (voiced) { vc.vadSpeech++; vc.vadSilence = 0; }
    else { vc.vadSilence++; vc.vadSpeech = 0; }

    switch (voiceState) {
      case 'listening':
        // 连续 0.2s 有声 → 开始记录句子
        if (vc.vadSpeech >= 2) {
          vc.vadSpeech = 0;
          vc.vadSilence = 0;
          // 回退 4 个采集块（约 0.5s）：VAD 确认有滞后，把语音开头也包含进录音
          vc.segStart = Math.max(0, vc.recChunks.length - 4);
          vc.segLen = 0;
          setVoiceStatus(t('voice-recording'), 'recording');
        }
        break;
      case 'recording':
        // 静音 0.3s 或句子超 15s → 断句识别（低延迟：说完稍顿即识别）
        if (vc.vadSilence >= 3 || vc.segLen >= (vc.micCtx.sampleRate || 16000) * 15) {
          vc.vadSilence = 0;
          vc.vadSpeech = 0;
          transcribeSegment();
        }
        break;
      case 'thinking':
        // 思考中用户直接说话 → 转入录音（停止旧回复朗读，等待中的旧回复到达时不再朗读）
        if (vc.vadSpeech >= 2) {
          vc.vadSpeech = 0;
          vc.vadSilence = 0;
          stopSpeak();
          sentenceQueue.length = 0;
          pendingText = '';
          vc.segStart = Math.max(0, vc.recChunks.length - 4);
          vc.segLen = 0;
          vc.suppressSpeak = true; // 标记：正在等待的旧回复到达时跳过朗读
          setVoiceStatus(t('voice-recording'), 'recording');
        }
        break;
      case 'speaking':
        // 朗读中检测到用户说话（连续 0.2s，且音量盖过扬声器）→ 打断，立即转入记录
        if (vc.vadSpeech >= 2) {
          vc.vadSpeech = 0;
          vc.vadSilence = 0;
          stopSpeak();
          sentenceQueue.length = 0;
          pendingText = '';
          vc.segStart = Math.max(0, vc.recChunks.length - 4);
          vc.segLen = 0;
          setVoiceStatus(t('voice-recording'), 'recording');
        }
        break;
      default:
        break;
    }
  }

  /* ---- 断句：编码 WAV → ASR → 自动发送 ---- */
  function transcribeSegment() {
    if (!vc || vc.busy) return;
    vc.busy = true;
    var parts = vc.recChunks.slice(vc.segStart);
    vc.segStart = vc.recChunks.length;
    vc.segLen = 0;
    var total = 0;
    parts.forEach(function (c) { total += c.length; });
    // 释放长对话内存：只保留最近段落
    if (vc.recChunks.length > 512) {
      vc.recChunks = vc.recChunks.slice(vc.segStart);
      vc.segStart = 0;
    }
    if (total < 1600) { // <0.1s：噪音误触发，忽略
      vc.busy = false;
      setVoiceStatus(t('voice-listening'), 'listening');
      return;
    }
    var pcm = new Float32Array(total);
    var off = 0;
    parts.forEach(function (c) { pcm.set(c, off); off += c.length; });
    var wav = encodeWav(pcm, vc.micCtx.sampleRate || 16000);
    setVoiceStatus(t('voice-working'), 'transcribing');
    fetch(withToken('/ui/voice-stt'), {
      method: 'POST',
      headers: voiceHeaders(),
      body: JSON.stringify({ audio: wav }),
    }).then(function (res) {
      return res && res.ok ? res.json() : Promise.reject(new Error(res ? res.status : ''));
    }).then(function (j) {
      if (!vc) return; // 语音模式已在请求期间退出（vc 已释放），丢弃结果
      vc.busy = false;
      if (!voiceActive) {
        setVoiceStatus('', 'off');
        return;
      }
      var text = j && j.text ? String(j.text).trim() : '';
      if (!text) {
        setVoiceStatus(t('voice-listening'), 'listening');
        return;
      }
      lastVoiceText = text;
      $('vv-user-line').textContent = text;
      // 自动发送（与输入框同路：/ 开头走命令；语音模式消息带 voice 标记，服务端据此注入语音规则）
      if (text.charAt(0) === '/') post('/ui/command', { line: text });
      else post('/ui/send', { text: text, voice: true });
      setVoiceStatus(t('voice-thinking'), 'thinking');
    }).catch(function (e) {
      if (vc) vc.busy = false;
      setVoiceStatus(t('mic-fail') + (e instanceof Error ? e.message : String(e)), 'listening');
    });
  }

  /* ---- 朗读：句子级流式（模型边生成边合成，首句延迟最小化） ---- */
  var speakToken = 0;        // 打断令牌：递增后旧流的所有块全部丢弃
  var speakQueue = [];       // 待播放 PCM AudioBuffer（全局串行）
  var speakSource = null;    // 当前播放源
  var sentenceQueue = [];    // 待合成句子 {text, voice, style}
  var sentenceBusy = false;  // 是否有 TTS 请求进行中
  var sentenceVoice = '';    // 当前回复的音色（从 {{voice}} 标记解析）
  var sentenceStyle = '';    // 当前回复的风格
  var pendingText = '';      // 模型流式输出累积（切句缓冲）

  /* 进入新回复：重置句子状态 */
  function resetSentenceStream() {
    pendingText = '';
    sentenceVoice = '';
    sentenceStyle = '';
    stopSpeak();             // 丢弃上一回复未播完的音频
  }

  /* 流式增量：累积文本 → 解析标记 → 按句切分 → 逐句入队合成 */
  function feedSentenceStream(delta) {
    if (!voiceActive) return;
    pendingText += delta;
    // 解析 {{voice: 音色|风格}}（模型应放开头；若跨块到达也能解析）
    if (!sentenceVoice) {
      var tag = pendingText.match(/\{\{\s*voice\s*:\s*([^|}]+)\|([^}]+)\s*\}\}/);
      if (tag) {
        sentenceVoice = tag[1].trim();
        sentenceStyle = tag[2].trim();
        pendingText = pendingText.replace(/\{\{\s*voice\s*:\s*[^}]+\}\}/g, '').replace(/\s+/g, ' ').trim();
      }
    }
    // 标记尚未完整到达（跨块）：先不切句，等标记收齐
    if (pendingText.indexOf('{{voice') >= 0 && pendingText.indexOf('}}') < 0) return;
    // 按标点切句（。！？…；换行也切）
    var cut = pendingText.match(/[^。！？…；\n]*[。！？…；\n]/);
    while (cut) {
      var sent = cut[0].trim();
      pendingText = pendingText.slice(cut[0].length).replace(/^\s+/, '');
      if (sent) enqueueSentence(sent);
      cut = pendingText.match(/[^。！？…；\n]*[。！？…；\n]/);
    }
  }

  /* 回复结束：把残余文本也合成 */
  function flushSentenceStream() {
    var rest = pendingText.trim();
    pendingText = '';
    if (rest) enqueueSentence(rest);
  }

  function enqueueSentence(text) {
    if (!voiceActive) return;
    sentenceQueue.push({ text: text, voice: sentenceVoice, style: sentenceStyle });
    pumpSentence();
  }

  /* 串行流水线：上一句 TTS 流结束立即发下一句（不等播放完），块进全局队列连续播放 */
  function pumpSentence() {
    if (sentenceBusy || !sentenceQueue.length || !voiceActive) return;
    var item = sentenceQueue.shift();
    sentenceBusy = true;
    setVoiceStatus(t('voice-speaking'), 'speaking');
    try {
      if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
    } catch (e) { /* ignore */ }
    var payload = { text: item.text };
    if (item.voice) payload.voice = item.voice;
    if (item.style) payload.style = item.style;
    fetch(withToken('/ui/voice-tts'), {
      method: 'POST',
      headers: voiceHeaders(),
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res || !res.ok || !res.body) throw new Error((t('voice-fail') + 'HTTP ' + (res ? res.status : '?')));
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { sentenceBusy = false; pumpSentence(); return; }
          buf += decoder.decode(r.value, { stream: true });
          var idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            var frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            frame.split('\n').forEach(function (line) {
              if (!line.startsWith('data:')) return;
              var payload2 = line.slice(5).trim();
              if (!payload2 || payload2 === '[DONE]') return;
              try {
                var m = JSON.parse(payload2);
                if (m.error) throw new Error(m.error);
                if (m.pcm) queuePcm(m.pcm, speakToken);
              } catch (e) { /* skip */ }
            });
          }
          return pump();
        });
      }
      return pump().catch(function () { sentenceBusy = false; pumpSentence(); });
    }).catch(function (e) {
      sentenceBusy = false;
      if (voiceActive) pushToast(t('voice-fail') + (e instanceof Error ? e.message : ''));
      pumpSentence();
    });
  }

  function queuePcm(b64, token) {
    if (!voiceActive || token !== speakToken) return;
    try {
      var bin = atob(b64);
      var pcm = new Int16Array(bin.length / 2);
      for (var i = 0; i < pcm.length; i++) pcm[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16;
      var buffer = audioCtx.createBuffer(1, pcm.length, 24000);
      var data = buffer.getChannelData(0);
      for (var j = 0; j < pcm.length; j++) data[j] = pcm[j] / 32768;
      // 先入队，再启动播放：保证第一块也被播放
      speakQueue.push(buffer);
      if (!speakSource) playNext(token);
    } catch (e) { /* ignore bad chunk */ }
  }

  function playNext(token) {
    if (!voiceActive || token !== speakToken) return;
    if (!speakQueue.length) {
      speakSource = null;
      // 音频队列读完且无待合成句子：回聆听
      if (voiceState === 'speaking' && !sentenceBusy && !sentenceQueue.length) {
        setVoiceStatus(t('voice-listening'), 'listening');
      }
      return;
    }
    var buffer = speakQueue.shift();
    var src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(playAnalyser || audioCtx.destination);
    speakSource = src;
    src.onended = function () {
      speakSource = null;
      if (voiceActive && token === speakToken) playNext(token);
    };
    src.start();
  }

  function stopSpeak() {
    speakToken++;
    if (speakSource) {
      try { speakSource.onended = null; speakSource.stop(); } catch (e) { /* ignore */ }
      speakSource = null;
    }
    speakQueue.length = 0;
    playRms = 0;
  }

  /* ---- 水波球动效：多层同心水波 + 中心球体，音量驱动 ---- */
  var animSmooth = 0; // 音量平滑值
  function drawVoiceAnim() {
    if (!voiceActive) return;
    var cv = $('voice-canvas');
    var g = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var cx = W / 2, cy = H / 2;
    g.clearRect(0, 0, W, H);
    var vol = voiceState === 'speaking' ? Math.max(playRms, micRms * 0.6) : micRms;
    animSmooth += (vol - animSmooth) * 0.3;
    if (animSmooth < 0) animSmooth = 0;
    var v = Math.min(1, animSmooth);
    var hue = voiceState === 'recording' ? 340 : voiceState === 'speaking' ? 160 : 205;
    var now = Date.now();
    var breathe = 1 + Math.sin(now / 750) * 0.025;
    var R = (86 + v * 26) * breathe; // 球体半径，随音量呼吸

    // 球体主体：径向渐变（亮心 → 半透明边缘）
    var bg = g.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 4, cx, cy, R * 1.15);
    bg.addColorStop(0, 'hsla(' + hue + ', 90%, 78%, 0.95)');
    bg.addColorStop(0.45, 'hsla(' + hue + ', 85%, 62%, 0.75)');
    bg.addColorStop(1, 'hsla(' + hue + ', 80%, 45%, 0.18)');
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = bg;
    g.fill();

    // 球面高光（左上椭圆亮点，模拟水球光泽）
    g.beginPath();
    g.ellipse(cx - R * 0.34, cy - R * 0.4, R * 0.22, R * 0.13, -0.6, 0, Math.PI * 2);
    g.fillStyle = 'hsla(' + hue + ', 100%, 92%, 0.55)';
    g.fill();

    // 水波环：从球心向外扩散，环径随 sin 波动（音量越大波幅越强），波峰亮波谷暗
    var rings = 22;
    for (var i = 0; i < rings; i++) {
      var baseR = (i / rings) * (R * 1.55 + 34) + 5;
      var ph = baseR * 0.24 - now / 320;
      var wave = Math.sin(ph) * (2 + v * 15);
      var rr = Math.max(1.5, baseR + wave);
      var waveBright = (Math.sin(ph) * 0.5 + 0.5);
      var a = 0.06 + waveBright * (0.32 + v * 0.38) * (1 - i / rings * 0.55);
      if (a <= 0.02) continue;
      g.beginPath();
      g.arc(cx, cy, rr, 0, Math.PI * 2);
      g.strokeStyle = 'hsla(' + hue + ', 88%, ' + (58 + v * 16 + waveBright * 10) + '%, ' + a + ')';
      g.lineWidth = 1.6;
      g.stroke();
    }

    // 外圈偶发涟漪（每 2.4s 扩散一圈，像水珠落水）
    var ripples = [0.0, 0.55];
    for (var k = 0; k < ripples.length; k++) {
      var t = ((now / 2400 + ripples[k]) % 1);
      var rr2 = 8 + t * (R * 1.9 + 60);
      var a2 = (1 - t) * (0.16 + v * 0.2);
      if (a2 <= 0.02) continue;
      g.beginPath();
      g.arc(cx, cy, rr2, 0, Math.PI * 2);
      g.strokeStyle = 'hsla(' + hue + ', 90%, 72%, ' + a2 + ')';
      g.lineWidth = 2;
      g.stroke();
    }

    // 中心亮点（声芯）
    var core = 7 + v * 14;
    var cg = g.createRadialGradient(cx, cy, 1, cx, cy, core + 8);
    cg.addColorStop(0, 'rgba(255,255,255,0.95)');
    cg.addColorStop(1, 'hsla(' + hue + ', 95%, 78%, 0)');
    g.beginPath();
    g.arc(cx, cy, core + 8, 0, Math.PI * 2);
    g.fillStyle = cg;
    g.fill();

    rafTimer = requestAnimationFrame(drawVoiceAnim);
  }

  /* ---- 按住说话（快速录入，不进入连续模式） ---- */
  var micRec = null;
  function startMic() {
    if (micRec || voiceActive) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      pushToast(t('mic-fail') + 'getUserMedia unavailable');
      return;
    }
    setStatus('tool', t('mic-listening'));
    var ctx = null, processor = null, chunks = [], stream = null, stopped = false;
    var promise = navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (s) {
        stream = s;
        ctx = new AudioContext({ sampleRate: 16000 });
        var src = ctx.createMediaStreamSource(s);
        processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = function (e) {
          if (stopped) return;
          chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
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
          if (!total) { setStatus('idle'); return; }
          var pcm = new Float32Array(total);
          var off = 0;
          chunks.forEach(function (c) { pcm.set(c, off); off += c.length; });
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
    if (voiceActive) exitVoiceMode();
    else enterVoiceMode();
  });
  $('voice-exit').addEventListener('click', exitVoiceMode);
  // Esc 退出语音模式
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && voiceActive) exitVoiceMode();
  });
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
  $('session-search').addEventListener('input', function () {
    sessionFilter = this.value;
    renderSessions();
  });
  $('btn-export-sessions').addEventListener('click', exportSessions);
  $('btn-import-sessions').addEventListener('click', function () { $('sessions-import-file').click(); });
  $('sessions-import-file').addEventListener('change', function () {
    if (this.files && this.files[0]) importSessions(this.files[0]);
    this.value = '';
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
    btn.addEventListener('click', function () {
      var cmd = btn.getAttribute('data-cmd');
      if (cmd === '/sshterm') openSshTerminal();
      else post('/ui/command', { line: cmd });
    });
  });
  $('modal-backdrop').addEventListener('click', function (e) {
    if (e.target === this && dialog) {
      post('/ui/close', { id: dialog.id });
      hideDialog();
    }
  });

  // ---- Web SSH 终端事件 ----
  $('btn-sshterm').addEventListener('click', openSshTerminal);
  $('ssh-term-exit').addEventListener('click', exitSshTerminal);
  $('ssh-term-min').addEventListener('click', minimizeTermWindow);
  $('ssh-term-minibutton').addEventListener('click', restoreTermWindow);
  $('ssh-term-reconfig').addEventListener('click', function () { openSshTermForm(false); });
  $('ssh-term-new').addEventListener('click', openNewTermTab);
  $('ssh-term-max').addEventListener('click', toggleTermMax);
  $('ssh-term-clear').addEventListener('click', clearActiveTerm);
  $('ssh-term-reconnect').addEventListener('click', reconnectActiveTerm);
  $('ssh-term-send').addEventListener('click', sendActiveTermToBot);
  $('ssh-term-find').addEventListener('click', termFindToggle);
  $('ssh-term-find-close').addEventListener('click', termFindClose);
  $('ssh-term-find-prev').addEventListener('click', function () { termFindStep(-1); });
  $('ssh-term-find-next').addEventListener('click', function () { termFindStep(1); });
  $('ssh-term-find-input').addEventListener('input', function () { termRunFind(this.value); });
  $('ssh-term-find-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); termFindStep(e.shiftKey ? -1 : 1); }
    else if (e.key === 'Escape') { termFindClose(); termInputEl().focus(); }
  });
  // ---- 浮动窗口：标题栏拖动 + 右下角缩放 + 双击最大化/还原 ----
  var termDrag = null;
  $('ssh-term-top').addEventListener('pointerdown', function (e) {
    if (termMax) return;
    if (e.target.closest('button, input, .ssh-term-tab, .ssh-term-tabs')) return;
    var v = $('ssh-term-view');
    var r = v.getBoundingClientRect();
    termDrag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.preventDefault();
  });
  window.addEventListener('pointermove', function (e) {
    if (!termDrag) return;
    var v = $('ssh-term-view');
    v.style.left = Math.max(8, Math.min(e.clientX - termDrag.dx, window.innerWidth - v.offsetWidth - 8)) + 'px';
    v.style.top = Math.max(8, Math.min(e.clientY - termDrag.dy, window.innerHeight - v.offsetHeight - 8)) + 'px';
  });
  window.addEventListener('pointerup', function () {
    if (termDrag) { termDrag = null; saveTermGeom(); }
  });
  $('ssh-term-top').addEventListener('dblclick', function (e) {
    if (!e.target.closest('button, input, .ssh-term-tab, .ssh-term-tabs')) toggleTermMax();
  });
  var termResize = null;
  $('ssh-term-resize').addEventListener('pointerdown', function (e) {
    if (termMax) return;
    var v = $('ssh-term-view');
    var r = v.getBoundingClientRect();
    termResize = { sx: e.clientX, sy: e.clientY, w: r.width, h: r.height };
    e.preventDefault();
    e.stopPropagation();
  });
  window.addEventListener('pointermove', function (e) {
    if (!termResize) return;
    var v = $('ssh-term-view');
    v.style.width = Math.max(420, Math.min(termResize.w + e.clientX - termResize.sx, window.innerWidth - 8)) + 'px';
    v.style.height = Math.max(260, Math.min(termResize.h + e.clientY - termResize.sy, window.innerHeight - 8)) + 'px';
  });
  window.addEventListener('pointerup', function () {
    if (termResize) { termResize = null; saveTermGeom(); }
  });
  window.addEventListener('resize', function () {
    if (termActive) clampTermGeom();
  });
  $('ssh-term-screen').addEventListener('click', function () { termInputEl().focus(); });
  termInputEl().addEventListener('keydown', function (e) {
    if (!termActive) return;
    // Ctrl+1~9 切换标签
    if (e.ctrlKey && !e.altKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
      switchTermTab(Number(e.key) - 1);
      e.preventDefault();
      return;
    }
    var c = e.ctrlKey ? e.key.toLowerCase() : '';
    if (e.ctrlKey && (c === 'c' || c === 'd' || c === 'l' || c === 'z' || c === 'a' || c === 'e' || c === 'k' || c === 'u' || c === 'w')) {
      var seqs = { c: '\x03', d: '\x04', l: '\x0c', z: '\x1a', a: '\x01', e: '\x05', k: '\x0b', u: '\x15', w: '\x17' };
      termSend(seqs[c]);
      e.preventDefault();
      return;
    }
    if (e.metaKey || e.altKey) return;
    if (e.key === 'Enter') { termSend('\r'); e.preventDefault(); return; }
    if (e.key === 'Backspace') { termSend('\x7f'); e.preventDefault(); return; }
    if (e.key === 'Tab') { termSend('\t'); e.preventDefault(); return; }
    if (e.key === 'ArrowUp') { termSend('\x1b[A'); e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { termSend('\x1b[B'); e.preventDefault(); return; }
    if (e.key === 'ArrowRight') { termSend('\x1b[C'); e.preventDefault(); return; }
    if (e.key === 'ArrowLeft') { termSend('\x1b[D'); e.preventDefault(); return; }
    if (e.key === 'Home') { termSend('\x1b[H'); e.preventDefault(); return; }
    if (e.key === 'End') { termSend('\x1b[F'); e.preventDefault(); return; }
    if (e.key === 'Delete') { termSend('\x1b[3~'); e.preventDefault(); return; }
    if (e.key.length === 1) { termSend(e.key); e.preventDefault(); }
  });
  termInputEl().addEventListener('input', function () {
    if (!termActive) return;
    var v = termInputEl().value;
    if (v) {
      termInputEl().value = '';
      termSend(v);
    }
  });
  termInputEl().addEventListener('paste', function (e) {
    if (!termActive) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text');
    if (text) termSend(text);
  });
  window.addEventListener('resize', function () {
    var t = activeTerm();
    if (termActive && t && t.ws && t.connected) {
      t.ws.send(JSON.stringify({ type: 'resize', cols: termCols(), rows: termRows() }));
    }
  });

  // 折叠交互：工具块 / 思维链块；工具命令可一键送进 SSH 终端
  $('messages').addEventListener('click', function (e) {
    var run = e.target.closest('.term-run-btn');
    if (run) {
      e.preventDefault();
      e.stopPropagation();
      runInTerminal(run.getAttribute('data-cmd'));
      return;
    }
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
