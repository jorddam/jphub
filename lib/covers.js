// Cover art. covers/index.json in the data repo maps a work to its art:
//   "<work key>": "ebooks/<key>.jpg"        an image file
//   "app:<steam id>": [sheet, col, row]     a cell in a 10 x 10 sprite sheet
// The cover job fills it in as new items appear in the sheet.

import * as data from "./data.js";

let index = null;
export async function load() {
  if (!index) index = (await data.read("covers/index.json").catch(() => ({}))).data?.items || {};
  return index;
}
export function has(work) { return !!ref(work); }
function ref(work) {
  if (!index) return null;
  return (work.appid && index["app:" + work.appid]) || index[work.key] || null;
}

// Shows the work's cover in el once it scrolls into view. el keeps its placeholder until then.
// onImage(url) runs for an image file; a sprite is drawn as el's background.
const seen = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) { seen.unobserve(e.target); e.target._cover?.(); }
}, { rootMargin: "300px" });

export function show(el, work, onImage) {
  const r = ref(work);
  if (!r) return false;
  el._cover = async () => {
    if (Array.isArray(r)) {
      const url = await data.imageURL(`covers/games/covers-${String(r[0]).padStart(2, "0")}.webp`);
      if (!url) return;
      el.textContent = "";
      el.classList.add("sprite");
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundSize = "1000% 1000%";
      el.style.backgroundPosition = `${r[1] / 9 * 100}% ${r[2] / 9 * 100}%`;
    } else {
      const url = await data.imageURL("covers/" + r);
      if (url) onImage(url);
    }
  };
  seen.observe(el);
  return true;
}
