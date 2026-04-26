import { sendTranscription } from '@/handlers/handleAudio'
import Context from '@/models/Context'
import fileUrl from '@/helpers/fileUrl'
import report from '@/helpers/report'

export default async function handleTranscribe(ctx: Context) {
  try {
    // ❌ УБРАНО: paid и донат

    const message = ctx.msg.reply_to_message

    if (!message) {
      await ctx.reply(ctx.i18n.t('reply_to_voice'), {
        reply_to_message_id: ctx.msg.message_id,
      })
      return
    }

    const voice =
      message.voice || message.document || message.audio || message.video_note

    if (!voice) {
      await ctx.reply(ctx.i18n.t('reply_to_voice'), {
        reply_to_message_id: ctx.msg.message_id,
      })
      return
    }

    // Check size
    if (voice.file_size && voice.file_size >= 19 * 1024 * 1024) {
      if (!ctx.dbchat.silent) {
        await ctx.reply(ctx.i18n.t('error_twenty'), {
          parse_mode: 'Markdown',
          reply_to_message_id: message.message_id,
        })
      }
      return
    }

    // Get file URL
    const fileData = await ctx.api.getFile(voice.file_id)
    const voiceUrl = fileUrl(fileData.file_path)

    // Привязываем ответ к оригинальному сообщению
    ctx.msg.message_id = message.message_id

    // Отправляем распознавание
    await sendTranscription(ctx, voiceUrl, voice.file_id)
  } catch (error) {
    report(error, { ctx, location: 'handleTranscribe' })
  }
}
