/** 颜文字风格包与动画引擎（纯核心：Worker 可用） */

export type AnimState = 'idle' | 'thinking' | 'streaming' | 'tool' | 'waiting' | 'error' | 'success';

export interface KaomojiPack {
  id: string;
  name: string;
  states: Record<AnimState, string[]>;
  /** 欢迎横幅（多行） */
  banner: string[];
}

export const BUILTIN_PACKS: KaomojiPack[] = [
  {
    id: 'lively',
    name: '活泼风',
    states: {
      idle: ['ฅ(^•ω•^)ฅ'],
      thinking: ['(´･ω･`)', '(・ω・`)', '(｡•́︿•̀｡)', '(´･ω･`)'],
      streaming: ['◕‿◕', '✿◕‿◕✿', '◕‿◕✿', '✿◕‿◕'],
      tool: ['つ◕‿◕)つ', 'っ◕‿◕)っ', 'つ◕‿◕)つ', '(っ◕‿◕)っ'],
      waiting: ['(・_・?)', '(・_・ )'],
      error: ['(╯°□°）╯︵ ┻━┻', '(ノ°Д°)ノ ┻━┻'],
      success: ['(◕‿◕✿)', '✧(◕‿◕)✧'],
    },
    banner: ['ฅ(^•ω•^)ฅ  喵呜～欢迎来到 meowfish！', '输入消息开始对话，/help 查看全部命令。'],
  },
  {
    id: 'simple',
    name: '简约风',
    states: {
      idle: ['·ω·'],
      thinking: ['.', '..', '...'],
      streaming: ['›', '»'],
      tool: ['[▓▓  ]', '[▓▓▒ ]', '[▓▓▒░]'],
      waiting: ['·_·?', '·_·'],
      error: ['×_×'],
      success: ['·v·'],
    },
    banner: ['·ω·  欢迎使用 meowfish', '/help 查看命令。'],
  },
  {
    id: 'cool',
    name: '酷炫风',
    states: {
      idle: ['( •_•)'],
      thinking: ['(ಠ_ಠ)', '(ಠ_ಠ)>', '(ಠ_ಠ)⌐■-■', '(⌐■_■)'],
      streaming: ['⚡▁', '⚡▂', '⚡▃', '⚡▄'],
      tool: ['⚡ █▒░', '⚡ ██░', '⚡ ███'],
      waiting: ['(¬_¬)'],
      error: ['(╬ Ò﹏Ó)'],
      success: ['(⌐■_■)✓'],
    },
    banner: ['(⌐■_■)  meowfish ready.', '/help for commands.'],
  },
];

export function findPack(packs: KaomojiPack[], idOrName: string): KaomojiPack {
  return packs.find((p) => p.id === idOrName || p.name === idOrName) ?? packs[0]!;
}

/** 颜文字动画：按状态轮播帧 */
export class KaomojiAnim {
  private state: AnimState = 'idle';
  private frameIdx = 0;

  constructor(private pack: KaomojiPack) {}

  setState(state: AnimState): void {
    if (state !== this.state) {
      this.state = state;
      this.frameIdx = 0;
    }
  }

  getState(): AnimState {
    return this.state;
  }

  tick(): void {
    const frames = this.pack.states[this.state];
    if (frames.length > 1) this.frameIdx = (this.frameIdx + 1) % frames.length;
  }

  frame(): string {
    const frames = this.pack.states[this.state];
    return frames[Math.min(this.frameIdx, frames.length - 1)] ?? '';
  }
}
