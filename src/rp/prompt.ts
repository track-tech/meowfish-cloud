import { estimateTokens, type ChatMessage, type ModelProfile } from '../llm/types.js';
import type { CharacterCard } from './card-core.js';

/** 角色扮演提示词组装 */

export interface RpUser {
  name: string;
  description: string;
}

export function buildRpSystem(card: CharacterCard, user?: RpUser): string {
  const d = card.data;
  const parts: string[] = [];
  parts.push(`你在扮演角色「${d.name}」，在下面的场景中与用户对话。`);
  if (d.description) parts.push(`【角色背景】\n${d.description}`);
  if (d.personality) parts.push(`【性格】\n${d.personality}`);
  if (d.scenario) parts.push(`【当前场景】\n${d.scenario}`);
  if (user?.description) parts.push(`【对话对象（用户）】\n${user.name}：${user.description}`);
  parts.push('【对话要求】\n用中文回复；直接输出角色的台词与动作，不要替用户说话或描写用户的反应；不要输出任何前缀标签或说明文字。');
  if (d.system_prompt) parts.push(`【额外规则】\n${d.system_prompt}`);
  if (d.mes_example) parts.push(`【对话示例】\n${d.mes_example}\n【示例结束】`);
  if (d.post_history_instructions) parts.push(`【注意事项】\n${d.post_history_instructions}`);
  return parts.join('\n\n');
}

/** 组装完整请求消息：system + 裁剪后的历史 */
export function buildRpMessages(
  card: CharacterCard,
  user: RpUser | undefined,
  history: ChatMessage[],
  profile: ModelProfile,
): ChatMessage[] {
  const system: ChatMessage = { role: 'system', content: buildRpSystem(card, user) };
  const trimmed = trimHistory(history, profile.contextLength ?? 16000);
  return [system, ...trimmed];
}

/** 电脑权限开启时附加到角色 system prompt 的工具指令段 */
export function buildToolSection(toolNames: string[], cwd: string): string {
  return [
    '【电脑工具权限】你现在可以使用以下工具帮用户完成任务：',
    toolNames.join(', '),
    `当前工作目录: ${cwd}`,
    '规则：1) 先了解现状（读文件、列目录）再动手，不要凭空猜测；2) 修改文件先用 read_file 确认，再用 edit_file 精确替换；3) bash 命令会先经过用户授权，一次尽量完成一件事；4) 任务完成后简要总结改了什么；5) 保持角色语气——工具是完成任务的手段，完成前后仍以角色身份与用户对话。',
  ].join('\n');
}

/** 按 token 预算裁剪历史：永远保留 system 与最近消息 */
export function trimHistory(history: ChatMessage[], budget: number): ChatMessage[] {
  const msgs = history.filter((m) => m.role !== 'system');
  if (msgs.length === 0) return [];
  const est = (m: ChatMessage) => estimateTokens(m.content) + 8;
  const total = msgs.reduce((s, m) => s + est(m), 0);
  if (total <= budget * 0.85) return msgs;
  const keep = [msgs[msgs.length - 1]];
  let kept = est(msgs[msgs.length - 1]);
  for (let i = msgs.length - 2; i >= 0; i--) {
    const m = msgs[i];
    const cost = est(m);
    if (kept + cost > budget * 0.85 && msgs.length - i > 6) break;
    keep.unshift(m);
    kept += cost;
  }
  return keep;
}
