export default async () => {
  const info = {
    has_EYAD_BOT_TOKEN: !!process.env.EYAD_BOT_TOKEN,
    has_HALA_BOT_TOKEN: !!process.env.HALA_BOT_TOKEN,
    has_EYAD_CHAT_ID: !!process.env.EYAD_CHAT_ID,
    has_HALA_CHAT_ID: !!process.env.HALA_CHAT_ID,
    EYAD_CHAT_ID_value: process.env.EYAD_CHAT_ID || null,
    HALA_CHAT_ID_value: process.env.HALA_CHAT_ID || null,
  };
  return new Response(JSON.stringify(info, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
