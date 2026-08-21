/* Terra deterministic world generator and structure sampler.
 * No external dependencies. The runtime imports this file as a classic script.
 */
(function (global) {
  'use strict';

  const SEA_LEVEL = 24;
  const WORLD_HEIGHT = 64;
  const MIN_Y = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }

  function hash2(seed, x, z) {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  function hash3(seed, x, y, z) {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 1103515245) ^ Math.imul(z, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }

  function valueNoise2(seed, x, z, scale) {
    const gx = x / scale, gz = z / scale;
    const x0 = Math.floor(gx), z0 = Math.floor(gz);
    const tx = smooth(gx - x0), tz = smooth(gz - z0);
    const a = hash2(seed, x0, z0), b = hash2(seed, x0 + 1, z0);
    const c = hash2(seed, x0, z0 + 1), d = hash2(seed, x0 + 1, z0 + 1);
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz) * 2 - 1;
  }

  function valueNoise3(seed, x, y, z, scale) {
    const gx = x / scale, gy = y / scale, gz = z / scale;
    const x0 = Math.floor(gx), y0 = Math.floor(gy), z0 = Math.floor(gz);
    const tx = smooth(gx - x0), ty = smooth(gy - y0), tz = smooth(gz - z0);
    let c000 = hash3(seed, x0, y0, z0), c100 = hash3(seed, x0 + 1, y0, z0);
    let c010 = hash3(seed, x0, y0 + 1, z0), c110 = hash3(seed, x0 + 1, y0 + 1, z0);
    let c001 = hash3(seed, x0, y0, z0 + 1), c101 = hash3(seed, x0 + 1, y0, z0 + 1);
    let c011 = hash3(seed, x0, y0 + 1, z0 + 1), c111 = hash3(seed, x0 + 1, y0 + 1, z0 + 1);
    const x00 = lerp(c000, c100, tx), x10 = lerp(c010, c110, tx);
    const x01 = lerp(c001, c101, tx), x11 = lerp(c011, c111, tx);
    return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz) * 2 - 1;
  }

  function fbm2(seed, x, z, baseScale, octaves) {
    let amp = 1, freq = 1, total = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      total += valueNoise2(seed + i * 1013, x, z, baseScale / freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return total / norm;
  }

  function fbm3(seed, x, y, z, baseScale, octaves) {
    let amp = 1, freq = 1, total = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      total += valueNoise3(seed + i * 733, x, y, z, baseScale / freq) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return total / norm;
  }

  function distanceToSegment(px, pz, ax, az, bx, bz) {
    const abx = bx - ax, abz = bz - az;
    const apx = px - ax, apz = pz - az;
    const ab2 = abx * abx + abz * abz;
    const t = ab2 ? clamp((apx * abx + apz * abz) / ab2, 0, 1) : 0;
    const dx = px - (ax + abx * t), dz = pz - (az + abz * t);
    return Math.sqrt(dx * dx + dz * dz);
  }

  function buildPaths(seed, count, span, stride, narrow) {
    const paths = [];
    for (let i = 0; i < count; i++) {
      const side = i % 4;
      const lane = (Math.floor(i / 4) - Math.floor(count / 8)) * stride;
      let sx = 0, sz = 0, ex = 0, ez = 0;
      if (side === 0) { sx = -span; sz = lane + (hash2(seed, i, 99) - 0.5) * stride; ex = span; ez = lane + (hash2(seed, i, 199) - 0.5) * stride; }
      if (side === 1) { sx = lane + (hash2(seed, i, 299) - 0.5) * stride; sz = -span; ex = lane + (hash2(seed, i, 399) - 0.5) * stride; ez = span; }
      if (side === 2) { sx = span; sz = lane + (hash2(seed, i, 499) - 0.5) * stride; ex = -span; ez = lane + (hash2(seed, i, 599) - 0.5) * stride; }
      if (side === 3) { sx = lane + (hash2(seed, i, 699) - 0.5) * stride; sz = span; ex = lane + (hash2(seed, i, 799) - 0.5) * stride; ez = -span; }
      const bends = 8 + Math.floor(hash2(seed, i, 900) * 5);
      const pts = [];
      for (let k = 0; k <= bends; k++) {
        const t = k / bends;
        const baseX = lerp(sx, ex, t), baseZ = lerp(sz, ez, t);
        const perpX = -(ez - sz), perpZ = ex - sx;
        const plen = Math.hypot(perpX, perpZ) || 1;
        const wiggle = Math.sin(t * Math.PI * (2 + (i % 3)) + hash2(seed, i, k) * Math.PI * 2) * stride * 0.65;
        pts.push({ x: baseX + (perpX / plen) * wiggle, z: baseZ + (perpZ / plen) * wiggle });
      }
      paths.push({ pts, width: narrow ? 1.2 + hash2(seed, i, 901) * 1.2 : 1.8 + hash2(seed, i, 902) * 1.8 });
    }
    return paths;
  }

  class TerraWorldGenerator {
    constructor(seed) {
      this.seed = (seed | 0) || 1337;
      this.riverPaths = buildPaths(this.seed ^ 0x55AA, 8, 2400, 300, false);
      this.canalPaths = buildPaths(this.seed ^ 0xA55A, 4, 1800, 420, true);
    }

    continentalness(x, z) { return fbm2(this.seed + 11, x, z, 720, 4); }
    temperature(x, z) { return clamp(0.5 + fbm2(this.seed + 23, x, z, 900, 3) * 0.5 - z * 0.000035, 0, 1); }
    moisture(x, z) { return clamp(0.5 + fbm2(this.seed + 37, x, z, 600, 4) * 0.5, 0, 1); }
    mountainMask(x, z) { return clamp((fbm2(this.seed + 53, x, z, 380, 4) + 0.25) * 0.7, 0, 1); }

    distanceToPaths(x, z, paths) {
      let best = 1e9, width = 2;
      for (const path of paths) {
        for (let i = 0; i < path.pts.length - 1; i++) {
          const a = path.pts[i], b = path.pts[i + 1];
          const d = distanceToSegment(x, z, a.x, a.z, b.x, b.z);
          if (d < best) { best = d; width = path.width; }
        }
      }
      return { d: best, width };
    }

    riverDepth(x, z) {
      const r = this.distanceToPaths(x, z, this.riverPaths);
      const c = this.distanceToPaths(x, z, this.canalPaths);
      const rd = r.d < 8 ? clamp(1 - r.d / 8, 0, 1) : 0;
      const cd = c.d < 5.5 ? clamp(1 - c.d / 5.5, 0, 1) : 0;
      return { river: rd, canal: cd, riverDist: r.d, canalDist: c.d };
    }

    lakeInfo(x, z) {
      // Cellular lake candidates approximate ~0.010 feature frequency without using a contour-loop river.
      const cell = 96;
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      let best = null;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const gx = cx + dx, gz = cz + dz;
        const featureChance = hash2(this.seed ^ 0xF0E1, gx, gz);
        if (featureChance > 0.18) continue;
        const px = (gx + 0.22 + hash2(this.seed ^ 0x1357, gx, gz)) * cell;
        const pz = (gz + 0.22 + hash2(this.seed ^ 0x2468, gx, gz)) * cell;
        const radius = 23 + hash2(this.seed ^ 0x3141, gx, gz) * 46;
        const d = Math.hypot(x - px, z - pz);
        if (!best || d < best.d) best = { d, radius };
      }
      if (!best || best.d > best.radius) return null;
      const edge = clamp(1 - best.d / best.radius, 0, 1);
      return { edge, depth: 1 + edge * 9 };
    }

    biomeAt(x, z) {
      const cont = this.continentalness(x, z);
      const temp = this.temperature(x, z);
      const moist = this.moisture(x, z);
      const mountain = this.mountainMask(x, z);
      if (cont < -0.43) return 'Oceans';
      if (mountain > 0.60) return temp < 0.45 ? 'Snow Mountains' : 'Mountains';
      if (temp < 0.30) return 'Taiga';
      if (temp < 0.46 && moist > 0.50) return 'Snowy Plains';
      if (moist > 0.66 && temp > 0.50) return 'Swamp';
      if (moist > 0.58) return 'Dense Forest';
      if (moist > 0.48) return 'Forest';
      return 'Plains';
    }

    terrainHeight(x, z) {
      const cont = this.continentalness(x, z);
      const mountain = this.mountainMask(x, z);
      let h;
      if (cont < -0.43) {
        h = 4 + Math.floor((fbm2(this.seed + 71, x, z, 110, 3) + 1) * 1.5);
      } else {
        const base = 26 + fbm2(this.seed + 73, x, z, 180, 4) * 7;
        h = base + mountain * mountain * 20;
      }
      return clamp(Math.floor(h), 2, WORLD_HEIGHT - 4);
    }

    surfaceInfo(x, z) {
      const terrain = this.terrainHeight(x, z);
      const cont = this.continentalness(x, z);
      const path = this.riverDepth(x, z);
      const lake = this.lakeInfo(x, z);
      let surface = terrain;
      let waterDepth = 0;
      let waterKind = null;
      if (cont < -0.43) {
        waterDepth = Math.max(1, SEA_LEVEL - surface);
        waterKind = 'ocean';
      }
      if (lake && cont > -0.30 && path.river < 0.3 && path.canal < 0.3) {
        waterDepth = Math.max(waterDepth, Math.floor(lake.depth));
        waterKind = 'lake';
        surface = SEA_LEVEL - waterDepth;
      }
      const riverStrength = Math.max(path.river, path.canal);
      if (riverStrength > 0.42 && cont > -0.36) {
        waterDepth = Math.max(waterDepth, Math.floor(1 + riverStrength * 3));
        waterKind = path.river >= path.canal ? 'river' : 'canal';
        surface = Math.min(surface, SEA_LEVEL - waterDepth);
      }
      return { terrain, surface, waterDepth, waterKind, biome: this.biomeAt(x, z) };
    }

    isCave(x, y, z, surfaceY) {
      if (y < 5 || y >= surfaceY - 4) return false;
      const large = fbm3(this.seed + 191, x, y, z, 34, 3);
      const detail = fbm3(this.seed + 193, x + 19, y * 0.8, z - 11, 16, 2);
      const density = large * 0.75 + detail * 0.25;
      const depthFactor = clamp((surfaceY - y) / 14, 0, 1);
      return density > 0.48 + (1 - depthFactor) * 0.1;
    }

    undergroundWater(x, y, z, surfaceY) {
      if (y < 6 || y > surfaceY - 8) return false;
      const pocket = fbm3(this.seed + 271, x, y, z, 22, 2);
      const shape = fbm3(this.seed + 277, x + 41, y + 7, z - 17, 9, 2);
      return pocket > 0.56 && shape > 0.2 && hash3(this.seed ^ 0xC0DE, x >> 2, y >> 2, z >> 2) > 0.66;
    }

    blockAt(x, y, z) {
      if (y < MIN_Y || y >= WORLD_HEIGHT) return 0;
      const info = this.surfaceInfo(x, z);
      if (y > info.surface) {
        const waterCeiling = info.surface + info.waterDepth;
        if (y <= waterCeiling) return 15; // WATER
        return 0;
      }
      if (this.isCave(x, y, z, info.surface)) {
        if (this.undergroundWater(x, y, z, info.surface)) return 15;
        return 0;
      }
      if (info.waterDepth > 0 && y > info.surface) return 15;

      // Bedrock + deep stone
      if (y === 0) return 13;
      if (y < info.surface - 4) {
        // ores
        const r = hash3(this.seed + 801, x, y, z);
        if (y < 16 && r > 0.985) return 12; // diamond ore
        if (y < 30 && r > 0.957) return 14; // iron ore
        if (r > 0.985) return 11; // gravel vein
        return 3; // stone
      }
      if (y < info.surface - 1) {
        return info.biome === 'Oceans' || info.biome === 'Swamp' || info.biome === 'Plains' ? 2 : 3;
      }
      if (y < info.surface) {
        if (info.biome === 'Oceans' || info.biome === 'Swamp' || info.biome === 'Plains' || info.biome === 'Forest' || info.biome === 'Dense Forest') return 2;
        return 3;
      }
      // surface
      if (info.waterDepth > 0) return info.biome === 'Oceans' ? 4 : 6;
      if (info.biome === 'Taiga' || info.biome === 'Snowy Plains' || info.biome === 'Snow Mountains') return 10;
      if (info.biome === 'Mountains') return 3;
      if (info.biome === 'Swamp') return 2;
      if (info.biome === 'Plains') return 1;
      return 1;
    }


    treeAtCell(cellX, cellZ) {
      const r = hash2(this.seed ^ 0x7E57, cellX, cellZ);
      if (r < 0.68) return null;
      const x = cellX * 7 + 2 + Math.floor(hash2(this.seed ^ 0x7001, cellX, cellZ) * 5);
      const z = cellZ * 7 + 2 + Math.floor(hash2(this.seed ^ 0x7002, cellX, cellZ) * 5);
      const s = this.surfaceInfo(x, z);
      if (s.waterDepth > 0 || s.waterKind || ['Forest','Dense Forest','Taiga'].indexOf(s.biome) < 0) return null;
      const slope = Math.max(
        Math.abs(this.surfaceInfo(x - 2, z).surface - s.surface),
        Math.abs(this.surfaceInfo(x + 2, z).surface - s.surface),
        Math.abs(this.surfaceInfo(x, z - 2).surface - s.surface),
        Math.abs(this.surfaceInfo(x, z + 2).surface - s.surface)
      );
      if (slope > 2 || s.surface < 14 || s.surface > 38) return null;
      const h = s.biome === 'Taiga' ? 5 + Math.floor(hash2(this.seed ^ 0x7003, cellX, cellZ) * 3) : 4 + Math.floor(hash2(this.seed ^ 0x7004, cellX, cellZ) * 3);
      return {x,z,y:s.surface+1,h,type:s.biome};
    }

    treesForChunk(cx, cz) {
      const trees=[];
      const min=Math.floor((cx*16)/7)-2, max=Math.floor(((cx+1)*16-1)/7)+2;
      const minZ=Math.floor((cz*16)/7)-2, maxZ=Math.floor(((cz+1)*16-1)/7)+2;
      for(let tz=minZ;tz<=maxZ;tz++) for(let tx=min;tx<=max;tx++){const t=this.treeAtCell(tx,tz);if(t)trees.push(t);}
      return trees;
    }

    // Returns a deterministic structure descriptor, not actual placed voxels.
    structureAtCell(cellX, cellZ) {
      const r = hash2(this.seed ^ 0xABCD, cellX, cellZ);
      if (r < 0.91) return null;
      const x = cellX * 48 + 10 + Math.floor(hash2(this.seed ^ 0xCAFE, cellX, cellZ) * 28);
      const z = cellZ * 48 + 10 + Math.floor(hash2(this.seed ^ 0xFACE, cellX, cellZ) * 28);
      const w = 5 + Math.floor(hash2(this.seed ^ 0x1001, cellX, cellZ) * 3);
      const d = 5 + Math.floor(hash2(this.seed ^ 0x1002, cellX, cellZ) * 3);
      const h = 4;
      const s = this.surfaceInfo(x, z);
      if (s.waterDepth > 0 || s.biome === 'Oceans' || s.biome === 'Mountains' || s.biome === 'Snow Mountains') return null;
      if (s.surface < 15 || s.surface > 36) return null;
      const slope = Math.max(
        Math.abs(this.surfaceInfo(x - 3, z).surface - s.surface),
        Math.abs(this.surfaceInfo(x + 3, z).surface - s.surface),
        Math.abs(this.surfaceInfo(x, z - 3).surface - s.surface),
        Math.abs(this.surfaceInfo(x, z + 3).surface - s.surface)
      );
      if (slope > 2) return null;
      return { x, z, y: s.surface + 1, w, d, h, biome: s.biome };
    }

    structuresForChunk(cx, cz) {
      const structures = [];
      for (let gz = cz - 1; gz <= cz + 1; gz++) for (let gx = cx - 1; gx <= cx + 1; gx++) {
        const s = this.structureAtCell(gx, gz);
        if (s) structures.push(s);
      }
      return structures;
    }

    structureBlockAt(x, y, z) {
      const cx = Math.floor(x / 48), cz = Math.floor(z / 48);
      for (let gz = cz - 1; gz <= cz + 1; gz++) for (let gx = cx - 1; gx <= cx + 1; gx++) {
        const s = this.structureAtCell(gx, gz);
        if (!s) continue;
        const lx = x - s.x, lz = z - s.z, ly = y - s.y;
        if (lx < 0 || lx >= s.w || lz < 0 || lz >= s.d || ly < 0 || ly >= s.h + 1) continue;
        const isFloor = ly === 0;
        const isWall = lx === 0 || lx === s.w - 1 || lz === 0 || lz === s.d - 1;
        const isRoof = ly === s.h;
        const door = (lz === 0 && lx === Math.floor(s.w / 2) && ly < 2);
        if (door && !isFloor) return 0;
        if (isFloor) return 7;
        if (isWall) return 5;
        if (isRoof) return 5;
        return 0;
      }
      return null;
    }

    generateChunk(cx, cz, blockIds) {
      const size = 16, height = WORLD_HEIGHT;
      const structures = this.structuresForChunk(cx, cz);
      const ox = cx * size, oz = cz * size;
      blockIds.fill(0);
      const idx = (x, y, z) => x + size * (z + size * y);
      for (let lz = 0; lz < size; lz++) {
        for (let lx = 0; lx < size; lx++) {
          const wx = ox + lx, wz = oz + lz;
          const si = this.surfaceInfo(wx, wz);
          for (let y = 0; y < height; y++) {
            blockIds[idx(lx, y, lz)] = this.blockAt(wx, y, wz);
          }
        }
      }
      // Trees are applied before structures so houses can overwrite occupied vegetation deterministically.
      for (const t of this.treesForChunk(cx, cz)) {
        for (let dy = 0; dy < t.h; dy++) {
          const wx=t.x, wy=t.y+dy, wz=t.z;
          if (wx < ox || wx >= ox + size || wz < oz || wz >= oz + size || wy < 1 || wy >= height) continue;
          blockIds[idx(wx-ox,wy,wz-oz)] = 5;
        }
        const top=t.y+t.h-1;
        const radius=t.type==='Taiga'?1:2;
        for (let dz=-radius;dz<=radius;dz++) for (let dx=-radius;dx<=radius;dx++) {
          for (let dy=-1;dy<=1;dy++) {
            if (Math.abs(dx)+Math.abs(dz)+Math.abs(dy) > radius+1) continue;
            const wx=t.x+dx,wz=t.z+dz,wy=top+dy;
            if (wx<ox||wx>=ox+size||wz<oz||wz>=oz+size||wy<1||wy>=height) continue;
            const cur=blockIds[idx(wx-ox,wy,wz-oz)];
            if (cur===0) blockIds[idx(wx-ox,wy,wz-oz)] = 6;
          }
        }
      }
      // Structures are applied after terrain and trees.
      for (const s of structures) {
        for (let z = 0; z < s.d; z++) for (let x = 0; x < s.w; x++) for (let y = 0; y <= s.h; y++) {
          const wx = s.x + x, wy = s.y + y, wz = s.z + z;
          if (wx < ox || wx >= ox + size || wz < oz || wz >= oz + size || wy < 0 || wy >= height) continue;
          const id = this.structureBlockAt(wx, wy, wz);
          if (id !== null) blockIds[idx(wx - ox, wy, wz - oz)] = id;
        }
      }
      return blockIds;
    }
  }

  global.TerraWorldGenerator = TerraWorldGenerator;
  global.TERRA_WORLD_CONSTANTS = { SEA_LEVEL, WORLD_HEIGHT, MIN_Y };
})(window);
