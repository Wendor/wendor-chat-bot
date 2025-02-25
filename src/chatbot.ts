import { Telegraf } from 'telegraf';
import { escapers } from "@telegraf/entity";
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

function destroyChat(chatId: number) {
  chat[chatId] && delete chat[chatId];
}

function modelCreated(chatId: number) {
  return !!chat[chatId];
}

function selectedModel(chatId: number) {
  return chat[chatId].model.replace('models/', '');
}

bot.on(message('text'), async (ctx) => {
  const chatId = ctx.message.chat.id;

  if (ctx.message.text == '/reset') {
    destroyChat(chatId);
    ctx.sendMessage('Укажите модель', {
      reply_markup: {
        one_time_keyboard: true,
        keyboard: [
            ...models.map((model) => ([{
              text: model,
            }])),
        ],
      },
    });
    return;
  }

  if (models.indexOf(ctx.message.text.trim()) >= 0) {
    const model = ctx.message.text.trim();
    createChat(chatId, model);
    ctx.sendMessage('Новый чат создан');
    return;
  }

  if (ctx.message.text == '/model' && modelCreated(chatId)) {
    ctx.sendMessage('Используется модель ' + selectedModel(chatId));
    return;
  }

  if (ctx.message.text == '/start' || !modelCreated(chatId)) {
    createChat(chatId);
    ctx.sendMessage([
      'Добро пожаловать. Начинайте общение с ботом.',
      '/reset сбросит контекст бота.',
      '/model покажет какая модель используется.',
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
      await ctx.replyWithMarkdownV2(escapers.MarkdownV2(ans), {
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
