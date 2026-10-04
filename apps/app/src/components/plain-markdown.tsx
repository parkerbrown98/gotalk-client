import { Stack, Text } from '@gotalk/ui';

/**
 * Readable rendering of policy text until the shared Markdown renderer lands in Phase 3: headings,
 * bullets and paragraphs, with inline markup left as written.
 */
export function PlainMarkdown({ source }: { source: string }) {
  const blocks = source
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <Stack gap="lg">
      {blocks.map((block, i) => {
        const heading = /^(#{1,6})\s+(.*)$/s.exec(block);
        if (heading) {
          return (
            <Text key={i} variant={heading[1]!.length === 1 ? 'headingMd' : 'headingSm'} accessibilityRole="header">
              {heading[2]}
            </Text>
          );
        }
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <Stack key={i} gap="xs">
              {lines.map((l, j) => (
                <Text key={j} variant="bodySm">
                  {'\u2022  '}
                  {l.replace(/^\s*[-*]\s+/, '')}
                </Text>
              ))}
            </Stack>
          );
        }
        return (
          <Text key={i} variant="bodySm">
            {block.replace(/\n/g, ' ')}
          </Text>
        );
      })}
    </Stack>
  );
}
