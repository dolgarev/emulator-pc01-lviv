const fs = require('fs');
const path = require('path');
const vm = require('vm');

const publicDataDir = path.join(__dirname, '../public/data');
if (!fs.existsSync(publicDataDir)) fs.mkdirSync(publicDataDir, { recursive: true });

// Extract dumps
console.log('Extracting dumps...');
const dumpCode = fs.readFileSync(path.join(__dirname, '../js/dump.js'), 'utf-8');
const dumpSandbox = { Uint8ClampedArray, DataView, console };
vm.createContext(dumpSandbox);
vm.runInContext(dumpCode, dumpSandbox);

const dumps = dumpSandbox.Dump.storage;
const manifest = {};

for (const [key, dump] of Object.entries(dumps)) {
  const data = dump.data;
  const filename = `dump-${key}.bin`;
  fs.writeFileSync(path.join(publicDataDir, filename), Buffer.from(data));
  console.log(`Saved ${filename} (${data.length} bytes)`);
  
  manifest[key] = {
    name: dump.name,
    description: dump.description,
    type: dump.type,
    is_hidden: dump.is_hidden,
    profile: dump.profile,
    file: filename
  };
}

fs.writeFileSync(path.join(publicDataDir, 'dumps-manifest.json'), JSON.stringify(manifest, null, 2));
console.log('Saved dumps-manifest.json');

// Extract ROMs
console.log('Extracting ROMs...');
const romCode = fs.readFileSync(path.join(__dirname, '../js/rom.js'), 'utf-8');
const romSandbox = { console };
vm.createContext(romSandbox);
vm.runInContext(romCode, romSandbox);

// Rom.prototype.images
const roms = romSandbox.Rom.prototype.images;
for (const [key, rom] of Object.entries(roms)) {
  const data = rom.data;
  const filename = `rom-${key}.bin`;
  fs.writeFileSync(path.join(publicDataDir, filename), Buffer.from(data));
  console.log(`Saved ${filename} (${data.length} bytes)`);
}

console.log('Extraction complete.');
