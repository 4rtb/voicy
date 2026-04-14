import * as temp from 'temp'
import { createReadStream } from 'fs'
import { request } from 'https'
import Engine from '@/helpers/engine/Engine'
import EngineRecognizer from '@/helpers/engine/EngineRecognizer'
import RecognitionConfig from '@/helpers/engine/RecognitionConfig'
import deleteFile from '@/helpers/deleteFile'
import ffmpeg = require('fluent-ffmpeg')
import RecognitionResultPart from '@/helpers/engine/RecognitionResultPart'

const i18nCodes: Record<string, string> = {
  Arabic: 'ar',
  Bengali: 'bn',
  Burmese: 'my',
  Catalan: 'ca',
  Chinese: 'zh',
  Dutch: 'nl',
  English: 'en',
  Finnish: 'fi',
  French: 'fr',
  German: 'de',
  Hindi: 'hi',
  Indonesian: 'id',
  Italian: 'it',
  Japanese: 'ja',
  Kannada: 'kn',
  Korean: 'ko',
  Malay: 'ms',
  Malayalam: 'ml',
  Marathi: 'mr',
  Polish: 'pl',
  Portuguese: 'pt',
  Russian: 'ru',
  Sinhalese: 'si',
  Spanish: 'es',
  Swedish: 'sv',
  Tagalog: 'tl',
  Tamil: 'ta',
  Telugu: 'te',
  Thai: 'th',
  Turkish: 'tr',
  Urdu: 'ur',
  Vietnamese: 'vi',
}

const witLanguages: Record<string, string> = {
  English: process.env.WIT_EN || '',
  Russian: process.env.WIT_RU || '',
}

for (const key of Object.keys(witLanguages)) {
  if (!i18nCodes[key] || !witLanguages[key]) {
    delete witLanguages[key]
  }
}

function splitPath(path: string, duration: number): Promise<string[]> {
  const trackLength = 15
  const lastTrackLength = duration % trackLength

  const promises: Promise<string>[] = []
  for (let i = 0; i < duration; i += trackLength) {
    const splitDuration =
      i + trackLength <= duration ? trackLength : lastTrackLength
    if (splitDuration > 1) {
      const output = temp.path({ suffix: '.flac' })
      promises.push(
        new Promise<string>((res, rej) => {
          ffmpeg()
            .input(path)
            .on('error', (error: Error) => {
              rej(error)
            })
            .on('end', () => res(output))
            .output(output)
            .setStartTime(i)
            .duration(splitDuration)
            .audioFrequency(16000)
            .toFormat('s16le')
            .run()
        })
      )
    }
  }
  return Promise.all(promises)
}

function recognizePath(path: string, token: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const options = {
      method: 'POST',
      hostname: 'api.wit.ai',
      port: null,
      path: '/speech?v=20170307',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type':
          'audio/raw;encoding=signed-integer;bits=16;rate=16000;endian=little',
        'cache-control': 'no-cache',
      },
      timeout: 120 * 1000,
    }

    const req = request(options, (res) => {
      const chunks: Buffer[] = []

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks)
          const json = JSON.parse(body.toString())

          if (json.error) {
            const error = new Error(json.error)
            error.message = `(${json.code}): ${error.message}`
            reject(error)
          } else {
            resolve(String(json._text || ''))
          }
        } catch (err) {
          console.log('JSON error:', err)
          reject(err)
        }
      })

      res.on('error', reject)
    })

    req.on('error', reject)

    const stream = createReadStream(path)
    stream.pipe(req)

    stream.on('error', reject)
  })
}

const defaultLanguageCode = 'English'

async function recognize({
  chat,
  duration,
  ogaPath,
}: RecognitionConfig): Promise<RecognitionResultPart[]> {
  const token =
    chat.witToken ||
    witLanguages[chat.languages[Engine.wit] || defaultLanguageCode]

  const paths = await splitPath(ogaPath, duration)
  const savedPaths = paths.slice()

  try {
    let result: string[] = []

    while (paths.length) {
      const pathsToRecognize = paths.splice(0, 5)
      const promises: Promise<string>[] = pathsToRecognize.map((path) =>
        recognizePath(path, token)
      )

      const responses = await Promise.all(promises)
      result = result.concat(responses.map((r: string) => r.trim()))

      for (const path of pathsToRecognize) {
        deleteFile(path)
      }
    }

    const splitDuration = 15

    return result.length < 2
      ? [{ timeCode: `0-${duration}`, text: result[0] || '' }]
      : result.map((text, i) => ({
          timeCode:
            i === result.length - 1
              ? `${i * splitDuration}-${duration}`
              : `${i * splitDuration}-${(i + 1) * splitDuration}`,
          text,
        }))
  } finally {
    for (const path of savedPaths) {
      deleteFile(path)
    }
  }
}

function languageForTelegramCode(telegramCode?: string): string {
  if (!telegramCode) return defaultLanguageCode

  for (const key of Object.keys(i18nCodes)) {
    if (telegramCode.toLowerCase().includes(key.toLowerCase())) {
      return key
    }
  }

  return defaultLanguageCode
}

export const wit: EngineRecognizer = {
  code: Engine.wit,
  name: 'Wit.ai',
  languages: Object.keys(witLanguages).map((l) => ({
    code: l,
    name: l,
    i18nCode: i18nCodes[l],
  })),
  recognize,
  languageForTelegramCode,
  defaultLanguageCode,
}
