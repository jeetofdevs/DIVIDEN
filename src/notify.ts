import type { Config } from "./config.js";

/** Kirim pengumuman ke grup/channel Telegram (opsional). Gagal kirim tidak menghentikan bot. */
export async function announce(cfg: Config, text: string): Promise<void> {
  if (!cfg.telegramBotToken || !cfg.telegramChatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.telegramChatId, text, disable_web_page_preview: true }),
    });
    if (!res.ok) console.warn(`Telegram gagal: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.warn("Telegram gagal:", err);
  }
}
