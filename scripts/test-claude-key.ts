/**
 * Test ANTHROPIC_API_KEY — robi 1 wywołanie do Claude Sonnet 4.6 z prostym
 * promptem tłumaczeniowym i wypisuje wynik. Uruchom:
 *   npx tsx scripts/test-claude-key.ts
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error("❌ Brak ANTHROPIC_API_KEY w .env");
    process.exit(1);
  }
  console.log(`✓ Klucz znaleziony: ${key.slice(0, 20)}…${key.slice(-6)}`);
  console.log(`  Długość: ${key.length} znaków`);

  const client = new Anthropic({ apiKey: key });

  console.log("\n→ Wysyłam test request do Claude Sonnet 4.6…");
  const start = Date.now();
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content:
            'Translate to English (return ONLY the translation, no commentary): "Witaj swiecie, to test instrukcji ACRO4F."',
        },
      ],
    });
    const elapsed = Date.now() - start;
    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock?.type === "text" ? textBlock.text : "(brak text)";
    console.log(`\n✓ Sukces! (${elapsed}ms)`);
    console.log(`  Model: ${response.model}`);
    console.log(`  Input tokens: ${response.usage.input_tokens}`);
    console.log(`  Output tokens: ${response.usage.output_tokens}`);
    console.log(`  Koszt: ~$${((response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000).toFixed(6)}`);
    console.log(`\nOdpowiedź:`);
    console.log(`  ${text}`);
    console.log(`\n🎉 Klucz działa. Możesz tłumaczyć instrukcje w edytorze.`);
  } catch (e) {
    const elapsed = Date.now() - start;
    console.error(`\n❌ Błąd po ${elapsed}ms:`);
    if (e instanceof Error) {
      console.error(`  ${e.message}`);
    } else {
      console.error(e);
    }
    console.error(`\nNajczęstsze przyczyny:`);
    console.error(`  - 401 Unauthorized → klucz nieprawidłowy lub revoked`);
    console.error(`  - 429 Rate limit → brak kredytów, dodaj kartę w console.anthropic.com → Billing`);
    console.error(`  - ENOTFOUND → brak internetu`);
    process.exit(1);
  }
}

main();
