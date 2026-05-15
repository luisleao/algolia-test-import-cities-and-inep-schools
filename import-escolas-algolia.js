const fs = require('fs');
const path = require('path');
const algoliasearch = require('algoliasearch');

const INDEX_NAME = 'escolas';
const DEFAULT_BATCH_SIZE = 1000;
const DATA_FILES = [
  path.join(__dirname, 'json', 'ensino-universidade.json'),
  path.join(__dirname, 'json', 'ensino-basico.json'),
];

function loadEnv() {
  const envPath = path.join(__dirname, '.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readJsonFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data || typeof data.table !== 'string' || !Array.isArray(data.rows)) {
    throw new Error(`Arquivo invalido: ${filePath}`);
  }

  return data;
}

function normalizeRecord(record, educationType) {
  const cleanRecord = { ...record };
  const municipalityCod = record.municipalityCod || record.entityCodMuniIbge;

  delete cleanRecord.deleted;
  delete cleanRecord.deleted_at;

  return {
    ...cleanRecord,
    municipalityCod: municipalityCod
      ? String(municipalityCod)
      : municipalityCod,
    education_type: educationType,
    objectID: `${educationType}_${record.id}`,
  };
}

function getBatchSize() {
  const batchSizeArg = process.argv.find((arg) =>
    arg.startsWith('--batch-size=')
  );

  if (!batchSizeArg) {
    return DEFAULT_BATCH_SIZE;
  }

  const batchSize = Number(batchSizeArg.split('=')[1]);

  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('Use --batch-size com um numero inteiro maior que zero.');
  }

  return batchSize;
}

async function configureIndexSettings(index) {
  await index.setSettings({
    searchableAttributes: ['entityName', 'entityInep'],
    attributesToHighlight: ['entityName', 'entityInep'],
    attributesForFaceting: [
      'filterOnly(municipalityCod)',
      'filterOnly(education_type)',
    ],
  });
}

async function saveInBatches(index, records, batchSize) {
  let imported = 0;

  for (let start = 0; start < records.length; start += batchSize) {
    const batch = records.slice(start, start + batchSize);

    await index.saveObjects(batch);
    imported += batch.length;

    console.log(
      `Importados ${imported}/${records.length} registros deste arquivo.`
    );
  }
}

async function main() {
  loadEnv();

  const appId =
    process.env.ALGOLIA_APP_ID ||
    process.env.ALGOLIA_APPLICATION_ID ||
    'HWH30FGJ0N';
  const apiKey = process.env.ALGOLIA_ADMIN_KEY || process.env.ALGOLIA_WRITE_KEY;
  const batchSize = getBatchSize();

  if (!apiKey) {
    throw new Error(
      'Defina ALGOLIA_ADMIN_KEY ou ALGOLIA_WRITE_KEY no .env antes de importar.'
    );
  }

  const client = algoliasearch(appId, apiKey);
  const index = client.initIndex(INDEX_NAME);
  const settingsOnly = process.argv.includes('--settings-only');

  await configureIndexSettings(index);

  if (settingsOnly) {
    console.log(`Configuracao do indice ${INDEX_NAME} atualizada.`);
    return;
  }

  for (const filePath of DATA_FILES) {
    console.log(`Lendo ${path.relative(__dirname, filePath)}...`);

    const data = readJsonFile(filePath);
    const records = data.rows.map((record) =>
      normalizeRecord(record, data.table)
    );

    console.log(
      `Enviando ${records.length} registros de ${data.table} para o indice ${INDEX_NAME}.`
    );

    await saveInBatches(index, records, batchSize);
  }

  console.log('Importacao finalizada.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
