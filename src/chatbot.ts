import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';
import tm from 'telegramify-markdown';
import { ChatSession, GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const models = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro',
  'gemini-2.0-flash-exp',
  'gemini-exp-1206',
  'gemini-2.0-flash-thinking-exp-01-21',
];

const defaultModel = models[0];

if (!process.env.TELEGRAM_TOKEN || !process.env.GOOGLE_TOKEN) {
  console.log(`TELEGRAM_TOKEN and GOOGLE_TOKEN envs not found`);
  process.exit();
}

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const AI = new GoogleGenerativeAI(process.env.GOOGLE_TOKEN);


const chat: Record<number, ChatSession> = {};

function createChat(chatId: number, modelName = '') {
  const model = AI.getGenerativeModel(
    {
      model: modelName || defaultModel,
      generationConfig: {
        temperature: 0.9,
        topP: 1,
        topK: 1,
        maxOutputTokens: 4096,
      }
    }, {
      baseUrl: process.env.BASE_URL || 'https://generativelanguage.googleapis.com',
    }
  );
  chat[chatId] = model.startChat();
}

bot.on(message('text'), async (ctx) => {
  const chatId = ctx.message.chat.id;
  if (!chat[chatId]) {
    createChat(chatId);
  }

  if (ctx.message.text.startsWith('/reset')) {
    const tmpMsg = ctx.message.text.split('_').filter((e) => e.trim().length > 0);
    let model = defaultModel;
    if (models.indexOf(tmpMsg[1]) >= 0) {
      model = tmpMsg[1];
    }
    createChat(chatId, model);
    ctx.sendMessage('Новый чат создан');
    return;
  }
  if (ctx.message.text == '/start') {
    createChat(chatId);
    ctx.sendMessage([
      'Добро пожаловать. Начинайте общение с ботом. /reset сбросит контекст бота.',
      'Для использования конкретной модели используйте /reset_<имя_модели>',
      ...models.map((model) => '/reset_' + model),
    ].join('\n'));
    return;
  }
  if (ctx.message.text.startsWith('/')) {
    return;
  }

  let writing: NodeJS.Timeout | null = null;

  try {
    ctx.sendChatAction('typing');
    writing = setInterval(() => {
      ctx.sendChatAction('typing');
    }, 3000);

    if (!chat) {
      createChat(chatId);
    }

    const request = await chat[chatId].sendMessage(ctx.message.text);
    const answer = request.response.text();
    //console.log(request.response.candidates?.map((p) => p.content.parts));

    const parts: string[] = [];
    let part: string[] = [];

    // пытаемся бить сообщение на части, не сломав markdown :-/
    for (const line of answer.split('\n')) {
      if ([...part, line].join('\n').length > 3900) {
        parts.push(tm(part.join('\n'), 'escape'));
        part = [line];
      } else {
        part.push(line);
      }
    }

    if (part.length) {
      parts.push(tm(part.join('\n'), 'escape'));
    }

    for (const ans of parts) {
      await ctx.replyWithMarkdownV2(ans, {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        reply_to_message_id: ctx.message.message_id,
      });
    }
  } catch (e: unknown) {
    console.error(e);
    if (e instanceof Error) {
      ctx.reply(e.message, {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        reply_to_message_id: ctx.message.message_id,
      });
    }
  } finally {
    if (writing) {
      clearInterval(writing);
    }
  }
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
