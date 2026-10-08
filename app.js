/**
 * 长三角三省一市行政区划 + 国道/省道网展示
 * 数据来源：DataV GeoAtlas（行政区划）、OpenStreetMap/Overpass（道路）
 */
const CONFIG = {
  regions: {
    '320000': '江苏省',
    '330000': '浙江省',
    '340000': '安徽省',
    '310000': '上海市'
  },
  datavBase: 'https://geo.datav.aliyun.com/areas_v3/bound',
  overpassUrl: 'https://overpass-api.de/api/interpreter',
  bbox: '29.0,116.0,35.5,123.5', // south,west,north,east
  localBoundaries: 'data/boundaries_county.json',
  localRoads: 'data/roads_gs.json'
};

const map = L.map('map', {
  center: [32.0, 119.5],
  zoom: 7,
  minZoom: 5,
  maxZoom: 14
});

const baseLayers = {
  '浅色底图': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map)
};

const overlays = {};
let boundaryBounds = null;

// ---------- UI helpers ----------
function setStatus(text, type = '') {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'status ' + type;
}

function fitBounds() {
  if (boundaryBounds) {
    map.fitBounds(boundaryBounds.pad(0.05));
  }
}

document.getElementById('btn-fit').addEventListener('click', fitBounds);

// ---------- Boundaries ----------
async function loadBoundaries() {
  setStatus('正在加载行政区划…');

  let geojson;
  try {
    const resp = await fetch(CONFIG.localBoundaries);
    if (resp.ok) {
      geojson = await resp.json();
      setStatus('已使用本地行政区划数据', 'success');
    }
  } catch (e) {
    // local file not present, fall back to DataV
  }

  if (!geojson) {
    try {
      geojson = await fetchBoundariesFromDataV();
      setStatus('已在线加载行政区划数据', 'success');
    } catch (e) {
      setStatus('行政区划加载失败：' + e.message, 'error');
      console.error(e);
      return;
    }
  }

  renderBoundaries(geojson);
  document.getElementById('btn-roads').disabled = false;
}

async function fetchBoundariesFromDataV() {
  const allFeatures = [];

  for (const [adcode, provinceName] of Object.entries(CONFIG.regions)) {
    // 省级边界（粗线）
    const provResp = await fetch(`${CONFIG.datavBase}/${adcode}.json`);
    if (!provResp.ok) throw new Error(`无法获取 ${provinceName} 省级边界`);
    const provGeo = await provResp.json();
    provGeo.features.forEach(f => {
      f.properties = { ...(f.properties || {}), _displayLevel: 'province', province: provinceName };
      allFeatures.push(f);
    });

    // 下级区/县边界
    const fullResp = await fetch(`${CONFIG.datavBase}/${adcode}_full.json`);
    if (!fullResp.ok) throw new Error(`无法获取 ${provinceName} 下级边界`);
    const fullGeo = await fullResp.json();

    if (adcode === '310000') {
      // 直辖市：省级 full 已直接到区/县
      fullGeo.features.forEach(f => {
        f.properties = { ...(f.properties || {}), _displayLevel: 'district', province: provinceName, city: provinceName };
        allFeatures.push(f);
      });
    } else {
      // 普通省：需要按市再取 full
      const cityPromises = fullGeo.features.map(async city => {
        const cp = city.properties || {};
        const cityAdcode = cp.adcode;
        const cityName = cp.name;
        try {
          const resp = await fetch(`${CONFIG.datavBase}/${cityAdcode}_full.json`);
          if (!resp.ok) throw new Error('city fetch failed');
          const cityGeo = await resp.json();
          return cityGeo.features.map(f => ({
            ...f,
            properties: { ...(f.properties || {}), _displayLevel: 'district', province: provinceName, city: cityName }
          }));
        } catch (e) {
          // fallback：保留市级边界
          return [{
            ...city,
            properties: { ...cp, _displayLevel: 'district', province: provinceName, city: cityName }
          }];
        }
      });
      const cityResults = await Promise.all(cityPromises);
      cityResults.flat().forEach(f => allFeatures.push(f));
    }
  }

  return { type: 'FeatureCollection', features: allFeatures };
}

function renderBoundaries(geojson) {
  const provinceLayer = L.geoJSON(geojson, {
    filter: f => (f.properties || {})._displayLevel === 'province',
    style: {
      color: '#1e3a8a',
      weight: 4,
      opacity: 1,
      fillOpacity: 0.04,
      fillColor: '#93c5fd'
    },
    onEachFeature: bindAreaPopup
  }).addTo(map);

  const countyLayer = L.geoJSON(geojson, {
    filter: f => (f.properties || {})._displayLevel === 'district',
    style: {
      color: '#6b7280',
      weight: 1,
      opacity: 0.75,
      fillOpacity: 0,
      fillColor: 'transparent'
    },
    onEachFeature: bindAreaPopup
  }).addTo(map);

  overlays['省界'] = provinceLayer;
  overlays['县/区界'] = countyLayer;

  const group = L.featureGroup([provinceLayer, countyLayer]);
  boundaryBounds = group.getBounds();
  map.fitBounds(boundaryBounds.pad(0.05));

  L.control.layers(baseLayers, overlays, { collapsed: false, position: 'topright' }).addTo(map);
}

function bindAreaPopup(feature, layer) {
  const p = feature.properties || {};
  const lines = [];
  if (p.name) lines.push(`<b>${p.name}</b>`);
  if (p.city && p.city !== p.name) lines.push(`所属市：${p.city}`);
  if (p.province) lines.push(`所属省/市：${p.province}`);
  if (p.adcode) lines.push(`行政区划代码：${p.adcode}`);
  if (lines.length) layer.bindPopup(lines.join('<br>'));
}

// ---------- Roads ----------
document.getElementById('btn-roads').addEventListener('click', loadRoads);

async function loadRoads() {
  const btn = document.getElementById('btn-roads');
  btn.disabled = true;
  btn.textContent = '道路网加载中…';
  setStatus('正在下载国道/省道路网…');

  let geojson;
  try {
    const resp = await fetch(CONFIG.localRoads);
    if (resp.ok) {
      geojson = await resp.json();
      setStatus('已使用本地道路数据', 'success');
    }
  } catch (e) {
    // fall back to Overpass
  }

  if (!geojson) {
    try {
      geojson = await fetchRoadsFromOverpass();
      setStatus('已在线加载国道/省道路网', 'success');
    } catch (e) {
      setStatus('道路网加载失败：' + e.message, 'error');
      btn.textContent = '重试道路网';
      btn.disabled = false;
      console.error(e);
      return;
    }
  }

  renderRoads(geojson);
  btn.textContent = '道路网已加载';
}

async function fetchRoadsFromOverpass() {
  const query = `[out:json][timeout:120];
(
  way["highway"]["ref"~"^[GS][0-9]+"](${CONFIG.bbox});
);
out body;
>;
out skel qt;`;

  const resp = await fetch(CONFIG.overpassUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: 'data=' + encodeURIComponent(query)
  });

  if (!resp.ok) throw new Error(`Overpass HTTP ${resp.status}`);
  const data = await resp.json();

  const nodes = {};
  data.elements.forEach(el => {
    if (el.type === 'node') nodes[el.id] = [el.lon, el.lat];
  });

  const features = [];
  data.elements.forEach(el => {
    if (el.type !== 'way') return;
    const tags = el.tags || {};
    const ref = (tags.ref || '').trim();
    if (!ref || !/^[GS]\d+/i.test(ref)) return;

    const coords = el.nodes.map(id => nodes[id]).filter(Boolean);
    if (coords.length < 2) return;

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        name: tags.name || '',
        ref: ref,
        highway: tags.highway || '',
        road_type: /^G/i.test(ref) ? 'national' : 'provincial'
      }
    });
  });

  return { type: 'FeatureCollection', features };
}

function renderRoads(geojson) {
  const nationalLayer = L.geoJSON(geojson, {
    filter: f => (f.properties || {}).road_type === 'national',
    style: { color: '#dc2626', weight: 3, opacity: 0.9 },
    onEachFeature: bindRoadPopup
  }).addTo(map);

  const provincialLayer = L.geoJSON(geojson, {
    filter: f => (f.properties || {}).road_type === 'provincial',
    style: { color: '#f59e0b', weight: 2, opacity: 0.85 },
    onEachFeature: bindRoadPopup
  }).addTo(map);

  overlays['国道（G）'] = nationalLayer;
  overlays['省道（S）'] = provincialLayer;

  // 重新渲染图层控件，加入道路层
  document.querySelectorAll('.leaflet-control-layers').forEach(el => el.remove());
  L.control.layers(baseLayers, overlays, { collapsed: false, position: 'topright' }).addTo(map);
}

function bindRoadPopup(feature, layer) {
  const p = feature.properties || {};
  const lines = [];
  if (p.ref) lines.push(`<b>${p.ref}</b>`);
  if (p.name) lines.push(`名称：${p.name}`);
  if (p.highway) lines.push(`道路等级：${p.highway}`);
  if (lines.length) layer.bindPopup(lines.join('<br>'));
}

// ---------- Init ----------
loadBoundaries().then(() => {
  // 页面加载完成后，自动尝试加载道路网（可选，若想省流量可注释掉）
  // loadRoads();
});
