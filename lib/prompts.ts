import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type PromptName =
  | 'generate-problem'
  | 'judge-quality'
  | 'safety-check'
  | 'dialogue-character'
  | 'solve-check'
  | 'nakamoto-hint';

const ALLOWED: ReadonlySet<PromptName> = new Set([
  'generate-problem',
  'judge-quality',
  'safety-check',
  'dialogue-character',
  'solve-check',
  'nakamoto-hint',
]);

const PROMPT_DIR = join(process.cwd(), 'prompts');

export async function loadPrompt(name: PromptName): Promise<string> {
  if (!ALLOWED.has(name)) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  return readFile(join(PROMPT_DIR, `${name}.md`), 'utf8');
}
