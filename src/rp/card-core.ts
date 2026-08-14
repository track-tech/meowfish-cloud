/** 角色卡 V2（SillyTavern chara_card_v2）纯核心（Worker 可用，无 node 依赖） */

export interface CardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
  extensions: Record<string, unknown>;
}

export interface CharacterCard {
  spec: 'chara_card_v2';
  spec_version: string;
  data: CardData;
}

export function emptyCard(name = ''): CardData {
  return {
    name,
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    creator_notes: '',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    tags: [],
    creator: '',
    character_version: '1.0',
    extensions: {},
  };
}

export function parseCardJson(text: string): CharacterCard {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`角色卡 JSON 解析失败: ${e instanceof Error ? e.message : e}`);
  }
  const card = raw as Partial<CharacterCard>;
  const d = (card.data ?? {}) as Partial<CardData>;
  const data: CardData = {
    ...emptyCard(String(d.name ?? '未命名角色')),
    ...(typeof d.description === 'string' ? { description: d.description } : {}),
    ...(typeof d.personality === 'string' ? { personality: d.personality } : {}),
    ...(typeof d.scenario === 'string' ? { scenario: d.scenario } : {}),
    ...(typeof d.first_mes === 'string' ? { first_mes: d.first_mes } : {}),
    ...(typeof d.mes_example === 'string' ? { mes_example: d.mes_example } : {}),
    ...(typeof d.creator_notes === 'string' ? { creator_notes: d.creator_notes } : {}),
    ...(typeof d.system_prompt === 'string' ? { system_prompt: d.system_prompt } : {}),
    ...(typeof d.post_history_instructions === 'string' ? { post_history_instructions: d.post_history_instructions } : {}),
    ...(Array.isArray(d.alternate_greetings) ? { alternate_greetings: d.alternate_greetings.map(String) } : {}),
    ...(Array.isArray(d.tags) ? { tags: d.tags.map(String) } : {}),
    ...(typeof d.creator === 'string' ? { creator: d.creator } : {}),
    ...(typeof d.character_version === 'string' ? { character_version: d.character_version } : {}),
    ...(typeof d.extensions === 'object' && d.extensions ? { extensions: d.extensions } : {}),
  };
  return { spec: 'chara_card_v2', spec_version: String(card.spec_version ?? '2.0'), data };
}

