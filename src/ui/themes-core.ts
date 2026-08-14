/** 配色主题（纯核心：Worker 可用） */

export interface Theme {
  id: string;
  name: string;
  bg: string;
  fg: string;
  dim: string;
  accent: string;
  user: string;
  assistant: string;
  tool: string;
  error: string;
  success: string;
  warning: string;
  border: string;
  selection: string;
}

export const BUILTIN_THEMES: Theme[] = [
  {
    id: 'deep-sea',
    name: '深海',
    bg: '#0b0f1a',
    fg: '#d8e0ee',
    dim: '#6b7a90',
    accent: '#7dd3fc',
    user: '#f0a6ca',
    assistant: '#7dd3fc',
    tool: '#94e2d5',
    error: '#f38ba8',
    success: '#a6e3a1',
    warning: '#f9e2af',
    border: '#3b4a63',
    selection: '#233047',
  },
  {
    id: 'shoal',
    name: '浅滩',
    bg: '#faf6ef',
    fg: '#3a3a44',
    dim: '#9c958a',
    accent: '#d97757',
    user: '#b0598e',
    assistant: '#2f7fbd',
    tool: '#1f8a70',
    error: '#c0504d',
    success: '#4d8f4d',
    warning: '#b07d2b',
    // 边框必须与浅色背景有明显对比（否则菜单/输入框框线几乎不可见）
    border: '#b8ac97',
    selection: '#e8e0d0',
  },
  {
    id: 'contrast',
    name: '霓虹',
    bg: '#000000',
    fg: '#ffffff',
    dim: '#c0c0c0',
    accent: '#ffff00',
    user: '#00ffff',
    assistant: '#00ff00',
    tool: '#ffff00',
    error: '#ff0000',
    success: '#00ff7f',
    warning: '#ffaa00',
    border: '#808080',
    selection: '#404040',
  },
  {
    id: 'colorblind',
    name: '暮色',
    bg: '#111111',
    fg: '#e6e6e6',
    dim: '#8a8a8a',
    accent: '#ffa657',
    user: '#f2cc60',
    assistant: '#58a6ff',
    tool: '#7ee787',
    error: '#ff7b72',
    success: '#7ee787',
    warning: '#e3b341',
    border: '#484f58',
    selection: '#333333',
  },
  {
    id: 'milk-tea',
    name: '猫咪奶茶',
    bg: '#2b1e1a',
    fg: '#f5e6d3',
    dim: '#a08c7a',
    accent: '#f5a8c0',
    user: '#ffb3a7',
    assistant: '#ffe3b3',
    tool: '#c9e4c5',
    error: '#ff9e9e',
    success: '#b8e0b0',
    warning: '#f7d794',
    border: '#6b5147',
    selection: '#4a352c',
  },
];

export function findTheme(themes: Theme[], idOrName: string): Theme {
  return themes.find((t) => t.id === idOrName || t.name === idOrName) ?? themes[0]!;
}

/** 判断主题明暗（按背景亮度，与前端 isLightHex 同一算法） */
export function themeIsLight(t: Theme): boolean {
  const v = (t.bg || '#0b0f1a').replace('#', '');
  const h = v.length === 3 ? v[0] + v[0] + v[1] + v[1] + v[2] + v[2] : v;
  const n = parseInt(h, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}
