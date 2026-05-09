// src/main/dictionary.js - 词典查询（Free Dictionary API + ECDICT）
const path = require('path');
const { net } = require('electron');
const { app } = require('electron');

let db = null;

/**
 * 懒初始化 ECDICT 数据库
 */
function getDB() {
  if (db) return db;

  // 开发模式和打包模式的路径
  const isDev = !app.isPackaged;
  const dbPath = isDev
    ? path.join(__dirname, '../../assets/ecdict.db')
    : path.join(process.resourcesPath, 'ecdict.db');

  try {
    const Database = require('better-sqlite3');
    db = new Database(dbPath, { readonly: true });
    console.log('[Dictionary] ECDICT loaded from:', dbPath);
  } catch (err) {
    console.warn('[Dictionary] ECDICT not available:', err.message);
    db = null;
  }
  return db;
}

/**
 * 查询 ECDICT 离线词库
 * ECDICT schema: word, phonetic, definition, translation, pos, ...
 */
function queryECDICT(word) {
  const database = getDB();
  if (!database) return null;

  try {
    const row = database.prepare(
      'SELECT word, phonetic, definition, translation, pos FROM stardict WHERE word = ? COLLATE NOCASE LIMIT 1'
    ).get(word.toLowerCase().trim());

    if (!row) return null;

    return {
      phonetic: row.phonetic || '',
      // translation 格式：中文释义，换行分隔
      chineseDefinitions: row.translation
        ? row.translation.split('\n').filter(Boolean)
        : [],
      pos: row.pos || ''
    };
  } catch (err) {
    console.warn('[Dictionary] ECDICT query error:', err.message);
    return null;
  }
}

/**
 * 查询 Free Dictionary API
 */
function queryFreeDictionary(word) {
  return new Promise((resolve) => {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`;

    const request = net.request(url);

    const timeout = setTimeout(() => {
      request.abort();
      resolve(null);
    }, 5000);

    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk.toString(); });
      response.on('end', () => {
        clearTimeout(timeout);
        if (response.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          const json = JSON.parse(data);
          const entry = json[0];
          if (!entry) { resolve(null); return; }

          // 提取音标
          const phonetic = entry.phonetic ||
            entry.phonetics?.find(p => p.text)?.text || '';

          // 提取所有词义
          const meanings = (entry.meanings || []).map(m => ({
            partOfSpeech: m.partOfSpeech,
            definitions: (m.definitions || []).slice(0, 3).map(d => ({
              definition: d.definition,
              example: d.example || ''
            }))
          }));

          resolve({ phonetic, meanings });
        } catch {
          resolve(null);
        }
      });
      response.on('error', () => { clearTimeout(timeout); resolve(null); });
    });

    request.on('error', () => { clearTimeout(timeout); resolve(null); });
    request.end();
  });
}

/**
 * 主查询函数：合并双源结果
 */
async function lookupWord(word) {
  console.log('[Dictionary] Looking up word:', word);

  const [freeDictResult, ecdictResult] = await Promise.all([
    queryFreeDictionary(word),
    Promise.resolve(queryECDICT(word))
  ]);

  console.log('[Dictionary] FreeDict result:', freeDictResult ? 'found' : 'null');
  console.log('[Dictionary] ECDICT result:', ecdictResult ? 'found' : 'null');

  if (!freeDictResult && !ecdictResult) {
    console.log('[Dictionary] No result found, returning null');
    return null; // 两个来源都没找到
  }

  console.log('[Dictionary] Returning combined result');
  return {
    word: word.trim(),
    phonetic: freeDictResult?.phonetic || ecdictResult?.phonetic || '',
    meanings: freeDictResult?.meanings || [],
    chineseDefinitions: ecdictResult?.chineseDefinitions || [],
    source: freeDictResult ? 'both' : 'ecdict-only'
  };
}

module.exports = { lookupWord };
