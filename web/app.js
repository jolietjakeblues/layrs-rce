import * as THREE from './vendor/three.module.js';
import { MapControls } from './vendor/MapControls.js';

// Colours are authored in sRGB and drawn as they are.
THREE.ColorManagement.enabled = false;

const SKY = '#e4e8ea';
const LAND = '#f4f3ef';
const WATER = '#b5c7c6';
const MAQUETTE = '#efeee9';
const GROUP_COLORS = ['#ec0000', '#1f4e8c', '#d99a12', '#2e8b57', '#7b3fa0', '#00909a', '#8c5a2b', '#d6336c'];
const MAX_GROUPS = GROUP_COLORS.length;
const ATTR_W = 256;
const WORKERS = Math.min(4, navigator.hardwareConcurrency || 2);
const MODE = { period: 0, floors: 1, energy: 2, layers: 3 };
// Energy labels G … A+++++ (index 1–12; 0 = no label), from red through yellow to deep green.
const ENERGY_COLORS = ['#efeee9', '#c1272d', '#e4572e', '#f08a24', '#f6c445', '#c9d64a', '#8cc152', '#4caf50',
  '#2e9a49', '#1d8040', '#126b35', '#0b5a2c', '#064a24'];

// The city comes from ?city=<name>, else from the page's data-city, else it is the first one built (data/cities.json,
// s03_tiles); its files are in data/<city>/ (pipeline/city.py).
const CITY = new URLSearchParams(location.search).get('city') || document.documentElement.dataset.city
  || (await fetch('data/cities.json').then(r => r.json()))[0].city;
// A built site keeps its data in a folder named after its content (scripts/build_site.py, data-dir), so a browser never
// mixes cached files of two builds
const D = `data/${(CITY === document.documentElement.dataset.city && document.documentElement.dataset.dir) || CITY}/`;
const [config, layers, attrBuf] = await Promise.all([
  fetch(D + 'city.json').then(r => r.json()),
  fetch(D + 'layers.json').then(r => r.json()),
  fetch(D + 'attrs.bin').then(r => r.arrayBuffer()),
]);
const attrs = new DataView(attrBuf);
document.title = `LAYRS: ${config.label}`;

// ---------- Language ----------
// English and Dutch. Data carries `<field>_nl` next to each English text; the interface strings are below.
const NL_UI = {
  'steps': 'stappen',
  'Best': 'Beste',
  'Your points': 'Je punten',
  'pts': 'pnt',
  'Find buildings from riddles and old photos, point to them on the map, guess their age with the colours switched off. Up to 100 points an answer; hints cost points.': 'Vind gebouwen aan de hand van raadsels en oude foto’s, wijs ze aan op de kaart, raad hun leeftijd met de kleuren uit. Tot 100 punten per antwoord; hints kosten punten.',
  'Score to beat': 'Te verslaan',
  'A photo of the building': 'Een foto van het gebouw',
  'Tap the map where you think it stands.': 'Tik op de kaart waar je denkt dat het staat.',
  'Spot on.': 'Precies raak.',
  'off': 'ernaast',
  'Shown, not found: no points.': 'Getoond, niet gevonden: geen punten.',
  'Challenge a friend': 'Daag iemand uit',
  'Link copied': 'Link gekopieerd',
  'You beat your friend': 'Je wint',
  'A draw with your friend': 'Gelijkspel',
  'Your friend wins this time': 'Deze keer wint de ander',
  'Quests': 'Speurtochten',
  'Easy': 'Makkelijk',
  'Medium': 'Gemiddeld',
  'Hard': 'Moeilijk',
  'Start': 'Begin',
  'Continue': 'Verder',
  'Play again': 'Opnieuw',
  
  'Find buildings from riddles and old photos, guess their age with the colours switched off. Every answer is worth three crosses; hints and wrong answers cost one.': 'Vind gebouwen aan de hand van raadsels en oude foto’s, raad hun leeftijd met de kleuren uit. Elk antwoord is drie kruisjes waard; hints en foute antwoorden kosten er een.',
  'Your crosses': 'Je kruisjes',
  'Look inside the red circle.': 'Kijk binnen de rode cirkel.',
  'Find it on the map and click it.': 'Zoek het op de kaart en klik erop.',
  'Hint': 'Hint',
  'Colour by floors': 'Kleur naar verdiepingen',
  'Colour by period': 'Kleur naar periode',
  'Show me': 'Laat zien',
  'Your guess': 'Jouw gok',
  'Guess': 'Raad',
  'A photo of the building to find': 'Een foto van het gebouw dat je zoekt',
  'Built': 'Gebouwd',
  'Exactly right.': 'Precies goed.',
  'year off': 'jaar ernaast',
  'years off': 'jaar ernaast',
  'Shown, not found: no crosses.': 'Getoond, niet gevonden: geen kruisjes.',
  'Full marks.': 'Alle kruisjes.',
  'See the result': 'Bekijk het resultaat',
  'Next': 'Volgende',
  'Open its card': 'Open de kaart van het gebouw',
  'Not that one.': 'Die niet.',
  'You know your way around.': 'Je weet de weg.',
  'A good walk.': 'Een mooie wandeling.',
  'Time for a walk through town.': 'Tijd voor een wandeling door de stad.',
  'Copy result': 'Kopieer resultaat',
  'Copied': 'Gekopieerd',
  'More quests': 'Meer speurtochten',
  'Not this one, but right next to it.': 'Deze niet, maar het staat ernaast.',
  'Not this one. Very warm.': 'Deze niet. Heel warm.',
  'Not this one. A few streets away.': 'Deze niet. Een paar straten verderop.',
  'Not this one. Far off.': 'Deze niet. Ver weg.',
  'Warmer than before.': 'Warmer dan net.',
  'Colder than before.': 'Kouder dan net.',
  'Every building standing today, by age and historical context.': 'Elk gebouw dat er nu staat, naar leeftijd en historische context.',
  'About': 'Over', 'Did you know': 'Wist je dat', 'Today': 'Nu', 'Earlier': 'Eerder', 'Later': 'Later', 'This photo did not load.': 'Deze foto laadde niet.', 'Open it in the archive': 'Open hem in het archief', 'Add a layer on GitHub': 'Voeg een laag toe op GitHub',
  'Wikidata records this building as their residence.': 'Volgens Wikidata woonde deze persoon hier.',
  'Wikidata records this building as their place of work.': 'Volgens Wikidata werkte deze persoon hier.',
  'Wikidata records this building as their birthplace.': 'Volgens Wikidata werd deze persoon hier geboren.',
  'Wikidata records this building as the place where they died.': 'Volgens Wikidata overleed deze persoon hier.',
  'Period': 'Periode', 'Layers': 'Lagen', 'Floors': 'Verdiepingen', 'Energy': 'Energie',
  'buildings': 'gebouwen', 'Building the city': 'De stad wordt gebouwd',
  'Drag to turn. Right-drag or Shift-drag to move. Scroll to zoom.': 'Sleep om te draaien. Rechts slepen of Shift-slepen om te verschuiven. Scroll om te zoomen.',
  'Show legend': 'Legenda tonen', 'Hide legend': 'Legenda verbergen', 'Legend': 'Legenda',
  'Built in': 'Gebouwd in', 'Click a period to see it alone. Paler buildings have an approximate year.': 'Klik op een periode om alleen die te zien. Lichtere gebouwen hebben een geschat bouwjaar.',
  'Storeys': 'Verdiepingen', 'Energy label': 'Energielabel',
  'RVO energy labels, via Atlas Leefomgeving': 'Energielabels van RVO, via Atlas Leefomgeving',
  'All layers': 'Alle lagen', 'Find a person': 'Zoek een persoon', 'Buildings and their stories': 'Gebouwen en hun verhalen',
  'Height': 'Hoogte', 'from the 3D BAG model': 'uit het 3D BAG-model', 'height ÷ 3.2 m': 'hoogte ÷ 3,2 m',
  'Architect': 'Architect', 'Architects': 'Architecten', 'Style': 'Stijl', 'National monument': 'Rijksmonument',
  'In layers': 'In lagen', 'Dating': 'Datering', 'Read more': 'Meer lezen', 'From the street': 'Vanaf de straat',
  'Lived or worked here': 'Woonde of werkte hier', 'Source': 'Bron', 'Photo': 'Foto', 'Street view': 'Straatbeeld',
  'Wikipedia': 'Wikipedia', 'Dutch Wikipedia': 'Nederlandstalige Wikipedia', 'Monument register': 'Monumentenregister',
  'BAG register': 'BAG-register', 'BAG gives': 'De BAG geeft',
  'Click for the story and sources': 'Klik voor het verhaal en de bronnen', 'Click to keep this card open': 'Klik om deze kaart open te houden',
  'Play the city\'s growth': 'Speel de groei van de stad af', 'Pause': 'Pauze', 'Repeat': 'Herhalen', 'Close': 'Sluiten',
  'The register gives a round year here, more often than neighbouring years predict. Read it as “around then”.': 'Het register geeft hier een rond jaartal, vaker dan de omliggende jaren doen verwachten. Lees het als ‘rond die tijd’.',
  'The register has no real year (placeholder 1005, or one of the surplus 1905s of the old centre). Estimated from the nearest dated buildings.': 'Het register heeft geen echt jaartal (de plaatshouder 1005, of een van de overtollige 1905’s in het oude centrum). Geschat uit de dichtstbijzijnde gedateerde gebouwen.',
  'Year from the register of national monuments, which dates the building earlier than BAG does.': 'Jaartal uit het rijksmonumentenregister, dat het gebouw eerder dateert dan de BAG.',
  'Dated by the register of national monuments to a century or part of one; the map spreads it across that span.': 'Door het rijksmonumentenregister gedateerd op een eeuw of een deel daarvan; de kaart spreidt het over die periode.',
  'Year from Wikidata, which dates the building earlier than BAG does; the register of national monuments gives no date.': 'Jaartal uit Wikidata, dat het gebouw eerder dateert dan de BAG; het rijksmonumentenregister geeft geen datering.',
  'Layers': 'Lagen',
  'All layers': 'Alle lagen',
  'A building already stood on this footprint in the 1832 land register. BAG’s year may record a rebuilding, or this house replaced the older one.': 'Op deze plek stond al een gebouw in het kadaster van 1832. Het jaartal van de BAG kan een verbouwing zijn, of dit huis verving het oudere.',
  'Walk': 'Wandeling',
  'Plan a walk': 'Plan een wandeling',
  'Your walk': 'Jouw wandeling',
  'Choose what interests you, where you start and how far you want to go. The walk links the buildings with stories on the way.': 'Kies wat je interesseert, waar je begint en hoe ver je wilt lopen. De wandeling verbindt de gebouwen met een verhaal onderweg.',
  'What interests you': 'Wat interesseert je',
  'Where you start': 'Waar je begint',
  'How far': 'Hoe ver',
  'Nothing chosen: the walk takes every story.': 'Niets gekozen: de wandeling neemt alle verhalen mee.',
  'My location': 'Mijn locatie',
  'Pick on the map': 'Kies op de kaart',
  'Your location': 'Jouw locatie',
  'Point on the map': 'Punt op de kaart',
  'Your point': 'Jouw punt',
  'Back to the start': 'Terug naar het begin',
  'One way': 'Enkele reis',
  'Make my walk': 'Maak mijn wandeling',
  'Cancel': 'Annuleren',
  'Click the map where the walk should start.': 'Klik op de kaart waar de wandeling moet beginnen.',
  'This browser does not share its location.': 'Deze browser deelt geen locatie.',
  'You seem to be outside the city, so the walk starts at {s}.': 'Je lijkt buiten de stad te zijn, dus de wandeling begint bij {s}.',
  'The location was not shared. Pick a start on the map instead.': 'De locatie werd niet gedeeld. Kies het begin op de kaart.',
  'No stories within reach. Try a longer walk or more interests.': 'Geen verhalen binnen bereik. Probeer een langere wandeling of meer interesses.',
  'about {m} min': 'ongeveer {m} min',
  'Download the walk with its stories (KML), for Google My Maps: Create a new map, then Import.': 'Download de wandeling met verhalen (KML), voor Google Mijn kaarten: maak een nieuwe kaart en kies Importeren.',
  'Google Maps takes nine stops; the paler ones lie on the way.': 'Google Maps neemt negen stops; de lichtere liggen onderweg.',
  'Share my location': 'Deel mijn locatie',
  'Asking for your location…': 'Je locatie wordt gevraagd…',
  'Start from where you are: share your location, or choose a start below.': 'Begin waar je bent: deel je locatie, of kies hieronder een begin.',
  'Shorter than asked: the stories you chose lie close together.': 'Korter dan gevraagd: de verhalen die je koos liggen dicht bij elkaar.',
  'Longer than asked: few of the stories you chose lie that close.': 'Langer dan gevraagd: weinig van de gekozen verhalen liggen zo dichtbij.',
  'How many stops': 'Hoeveel stops',
  'As many as fit': 'Zoveel als past',
  'Fewer stops than asked: that is all the stories you chose.': 'Minder stops dan gevraagd: meer verhalen van je keuze zijn er niet.',
  'Open in Google Maps': 'Open in Google Maps',
  'Change': 'Wijzigen',
  'Straight lines on the map; Google Maps shows the walking route.': 'Rechte lijnen op de kaart; Google Maps toont de looproute.',
  'Buildings today': 'De gebouwen nu',
  'Generate a walk': 'Maak een wandeling',
  'Riddles hidden in the city. Find each building on the map, using its colours and layers, and click it. Every riddle is worth three tiles; hints cost one.': 'Raadsels verstopt in de stad. Zoek elk gebouw op de kaart, met de kleuren en lagen, en klik erop. Elk raadsel is drie tegeltjes waard; een hint kost er een.',
  'Your tiles': 'Jouw tegeltjes',
  'Open the layer': 'Open de laag',
  'Colour the map for it': 'Kleur de kaart ervoor',
  'Next riddle': 'Volgend raadsel',
  'Colour by energy label': 'Kleur naar energielabel',
  'See all quests': 'Alle speurtochten',
  'Found!': 'Gevonden!',
  'Right': 'Goed',
  'Without a single hint.': 'Zonder één hint.',
  'Quest complete': 'Speurtocht voltooid',
  'Any of {n} buildings counts.': 'Elk van {n} gebouwen telt.',
  'One of the buildings that answer the riddle.': 'Een van de gebouwen die het raadsel beantwoorden.',
  'Not this one, but very close.': 'Dit is hem niet, maar je bent er heel dichtbij.',
  'Not this one. You are getting warm.': 'Dit is hem niet. Je wordt warm.',
  'Not this one. Still a few streets away.': 'Dit is hem niet. Nog een paar straten verder.',
  'A hint may help.': 'Een hint kan helpen.',
  'Today’s photo of the building to find': 'Foto van vandaag van het gebouw dat je zoekt',
  'From the graph': 'Uit de graaf',
  'Back to the graph': 'Terug naar de graaf',
  'Graph': 'Graaf',
  'Search a building, address or street': 'Zoek een gebouw, adres of straat', 'Search': 'Zoeken', 'Address': 'Adres', 'Open in Google Maps': 'Open in Google Maps',
  'Building': 'Gebouw', 'Lived here': 'Woonde hier', 'Street': 'Straat', 'Nothing found': 'Niets gevonden', 'Clear': 'Wissen',
  '{n} is not in the register; nearest on the same side': '{n} staat niet in het register; het dichtstbijzijnde nummer aan dezelfde kant',
  'Before 1536': 'Vóór 1536',
  '1536–1653 After the great fire': '1536–1653 Na de stadsbrand',
  '1654–1799 After the thunderclap': '1654–1799 Na de Delftse donderslag',
  '1864–1913 Polytechnic and factories': '1864–1913 Polytechnische School en fabrieken',
};
let LANG = (() => {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'nl' || q === 'en') return q;
  try { const s = localStorage.getItem('lang'); if (s === 'nl' || s === 'en') return s; } catch {}
  return navigator.language?.startsWith('nl') ? 'nl' : 'en';
})();
const t = s => (LANG === 'nl' && NL_UI[s]) || s;
const tr = (o, k) => (LANG === 'nl' && o?.[k + '_nl']) || o?.[k];
const fmtLocale = () => LANG === 'nl' ? 'nl-NL' : 'en';
const periods = config.periods;
for (const p of periods) if (p.label_nl) NL_UI[p.label] = p.label_nl;
Object.assign(NL_UI, {
  'Protected townscapes': 'Beschermde gezichten', 'From the register': 'Uit het register',
  'Part of the complex': 'Onderdeel van het complex', 'Read the full entry': 'Lees de hele beschrijving in het register',
  'More about this mill on Allemolens.nl': 'Meer over deze molen op Allemolens.nl', 'with thanks': 'met dank',
  'Archaeology': 'Archeologie', 'Built': 'Gebouwd', 'Back to the city as built': 'Terug naar de gebouwde stad',
  'Turn the city over: what lies under the ground': 'Draai de stad om: wat er onder de grond ligt', 'Under the ground': 'Onder de grond', 'Underground': 'Ondergrond',
  'research areas': 'onderzoeksgebieden', 'Research area': 'Onderzoeksgebied', 'registered': 'geregistreerd',
  'Periods found here': 'Perioden die hier gevonden zijn', 'Archaeological complexes': 'Archeologische complexen',
  'Features': 'Grondsporen', 'Finds': 'Vondsten', 'Materials': 'Materialen', 'Find spots': 'Vindplaatsen',
  'Find spot': 'Vindplaats', 'Archaeological monument': 'Archeologisch monument', 'Loading…': 'Laden…',
  'Archaeological national monument': 'Archeologisch rijksmonument', 'Archaeological national monuments': 'Archeologische rijksmonumenten',
  'Terms from the Referentienetwerk (ABR); only public records.': 'Begrippen uit het Referentienetwerk (ABR); alleen openbare gegevens.',
  'Every surface is a research area, once for each period its finds and features date from: the deeper, the older.':
    'Elk vlak is een onderzoeksgebied, één keer voor elke periode waaruit de vondsten en grondsporen dateren: hoe dieper, hoe ouder.',
  'Click a period to see it alone; click a surface for what was found there. Periods and terms from the Referentienetwerk (ABR), records from the RCE Linked Data Voorziening; only what is public.':
    'Klik op een periode om alleen die te zien; klik op een vlak voor wat er gevonden is. Perioden en begrippen uit het Referentienetwerk (ABR), gegevens uit de Linked Data Voorziening van de RCE; alleen wat openbaar is.',
  'RCE image bank': 'Beeldbank RCE', 'Linked Data Voorziening': 'Linked Data Voorziening', 'In the Linked Data Voorziening': 'In de Linked Data Voorziening',
  'View in the Rijksmonumentenregister': 'Bekijk in het Rijksmonumentenregister', 'rights reserved': 'rechten voorbehouden', 'About the city': 'Over de stad',
  'Zoom in': 'Inzoomen', 'Zoom out': 'Uitzoomen', 'Overview': 'Overzicht',
});
document.querySelector('.masthead h1').childNodes[1].textContent = config.label;
// The about text, written from the city's own numbers and sources.
{
  const n = config.stats.buildings, bv = config.buildingSource === '3dbv';
  const [en, nl] = document.querySelectorAll('#about article');
  en.innerHTML = `<h2 id="about-title">About this map</h2>
    <p>${config.theme ? `All ${config.theme.markers.length.toLocaleString('en')} ${config.theme.noun[1]} that are national monuments in ${config.label.split(' in ').pop()}, each in its surroundings (${config.theme.radius} m around it), coloured by the year they were built.`
      : `All ${n.toLocaleString('en')} buildings of ${config.label}, coloured by the year they were built and set in the history that shaped them.`}</p>
    <p class="notice">A test, built with the open pipeline of <a href="https://github.com/alexbarakov/amsterdam-by-building" target="_blank" rel="noopener">Amsterdam, building by building</a> by Alex Barakov, inspired by Sasha Bogachev's <a href="https://paris.bogachev.fr" target="_blank" rel="noopener">Paris, building by building</a>.</p>
    <h3>Data</h3><ul>
    <li>Buildings, heights, years: ${bv ? 'Kadaster 3D Basisvoorziening 2025 (height statistics per building, without roof shapes)' : '3D BAG (TU Delft), with LoD 2.2 roofs in the centre and for listed buildings'}, on the building register BAG. CC BY 4.0.</li>
    <li>Monuments, styles, complexes, makers, protected townscapes: national monument register (RCE), via its linked data and search index. CC0. Photos from the RCE image bank, mostly CC BY 4.0.</li>
    <li>Water, boundary, addresses: BGT, BAG and Bestuurlijke Gebieden via PDOK${config.theme ? '' : '; street names: Nationaal Wegenbestand'}. CC0.</li>
    ${config.theme ? '' : '<li>Energy labels: RVO via RIVM Atlas Leefomgeving. Public domain.</li>'}
    <li>Names, photos: Wikidata, Wikipedia, Wikimedia Commons; each photo credits its author and licence.</li></ul>
    <h3>Method</h3><p>Rounded years in BAG are spread across their rounding step; where the monument register dates a building earlier, the register wins. Approximate years are paler and marked “c.”.</p>`;
  nl.innerHTML = `<h2>Over deze kaart</h2>
    <p>${config.theme ? `Alle ${config.theme.markers.length.toLocaleString('nl-NL')} ${config.theme.noun[3]} die rijksmonument zijn in ${config.label.split(' in ').pop()}, elk in zijn omgeving (${config.theme.radius} m eromheen), gekleurd naar bouwjaar.`
      : `Alle ${n.toLocaleString('nl-NL')} gebouwen van ${config.label}, gekleurd naar hun bouwjaar en geplaatst in de geschiedenis die ze vormde.`}</p>
    <p class="notice">Een test, gebouwd met de open pijplijn van <a href="https://github.com/alexbarakov/amsterdam-by-building" target="_blank" rel="noopener">Amsterdam, building by building</a> van Alex Barakov, geïnspireerd door <a href="https://paris.bogachev.fr" target="_blank" rel="noopener">Paris, building by building</a> van Sasha Bogachev.</p>
    <h3>Gegevens</h3><ul>
    <li>Gebouwen, hoogtes, bouwjaren: ${bv ? '3D Basisvoorziening 2025 van het Kadaster (hoogtestatistieken per gebouw, zonder dakvormen)' : '3D BAG (TU Delft), met de daken uit LoD 2.2 in het centrum en voor monumenten'}, op basis van de BAG. CC BY 4.0.</li>
    <li>Monumenten, stijlen, complexen, makers, beschermde gezichten: rijksmonumentenregister (RCE), via de linked data en de zoekindex. CC0. Foto's uit de beeldbank van de RCE, meestal CC BY 4.0.</li>
    <li>Water, grens, adressen: BGT, BAG en Bestuurlijke Gebieden via PDOK${config.theme ? '' : '; straatnamen: Nationaal Wegenbestand'}. CC0.</li>
    ${config.theme ? '' : '<li>Energielabels: RVO via de Atlas Leefomgeving van het RIVM. Publiek domein.</li>'}
    <li>Namen, foto's: Wikidata, Wikipedia, Wikimedia Commons; bij elke foto staan maker en licentie.</li></ul>
    <h3>Methode</h3><p>Afgeronde jaartallen in de BAG zijn gespreid over hun afrondingsstap; waar het monumentenregister een gebouw eerder dateert, wint het register. Geschatte jaren zijn lichter en gemarkeerd met “c.”.</p>`;
  // a theme credits its own sources, and says what is drawn rather than measured
  if (config.theme) {
    const c = config.theme.credit;
    en.querySelector('h2').nextElementSibling.insertAdjacentHTML('afterend', `<h3>With thanks</h3>
      <p>Every mill links to <a href="${c.url}" target="_blank" rel="noopener">Allemolens.nl</a> of the Vereniging De Hollandsche
      Molen, the source for the history of every mill in the Netherlands, with our thanks. Its texts and images are theirs and
      are not copied here. The types of mill come from the Referentienetwerk (RCE), the register's descriptions and Wikidata.
      The turning sails are an illustration: no 3D model of the buildings has sails.</p>`);
    nl.querySelector('h2').nextElementSibling.insertAdjacentHTML('afterend', `<h3>Met dank aan</h3>
      <p>Elke molen linkt naar <a href="${c.url}" target="_blank" rel="noopener">Allemolens.nl</a> van de Vereniging De Hollandsche
      Molen, de bron voor de geschiedenis van alle molens in Nederland, met dank. Hun teksten en beelden zijn van hen en
      staan hier niet overgenomen. De molentypen komen uit het Referentienetwerk (RCE), de omschrijvingen in het register en
      Wikidata. De draaiende wieken zijn een illustratie: geen 3D-model van de gebouwen heeft wieken.</p>`);
  }
  // the archaeology mode's own section; setArcheo() moves it to the top while the city is turned over
  if (config.archeology) {
    en.insertAdjacentHTML('beforeend', `<section class="about-arch"><h3>Under the ground: archaeology</h3>
      <p>The Archaeology switch turns the city over. Under the ground lies every archaeological research area
      (onderzoeksgebied) once for each period its finds and features date from: the deeper, the older, from Recent down
      to the Palaeolithic. Depth stands for time, not for metres below the surface. Click a surface for its
      archaeological complexes, features, finds and materials, and for the find spots.</p>
      <ul><li>Research areas, find spots, archaeological complexes, features and finds: the RCE's Linked Data Voorziening
      (CHO), through its search index. Only records marked public. CC0.</li>
      <li>Periods, types and materials: terms of the Referentienetwerk (RN2) and the Archeologisch Basisregister (ABR),
      each linked to its URI; the periods' years come from the ABR.</li>
      <li>Protected sites: the archaeological national monuments in the monument register.</li></ul>
      <p>An object spanning more than three periods counts as undated; an area without dated finds is not shown.</p></section>`);
    nl.insertAdjacentHTML('beforeend', `<section class="about-arch"><h3>Onder de grond: archeologie</h3>
      <p>De knop Archeologie draait de stad om. Onder de grond ligt elk archeologisch onderzoeksgebied één keer voor
      elke periode waaruit de vondsten en grondsporen dateren: hoe dieper, hoe ouder, van Recent tot het Paleolithicum.
      De diepte staat voor tijd, niet voor meters onder het maaiveld. Klik op een vlak voor de archeologische complexen,
      grondsporen, vondsten en materialen, en voor de vindplaatsen.</p>
      <ul><li>Onderzoeksgebieden, vindplaatsen, archeologische complexen, grondsporen en vondsten: de Linked Data
      Voorziening (CHO) van de RCE, via de zoekindex. Alleen wat als openbaar is gemarkeerd. CC0.</li>
      <li>Perioden, typen en materialen: begrippen uit het Referentienetwerk (RN2) en het Archeologisch Basisregister
      (ABR), elk met een link naar zijn URI; de jaartallen van de perioden komen uit het ABR.</li>
      <li>Beschermde terreinen: de archeologische rijksmonumenten uit het monumentenregister.</li></ul>
      <p>Een object dat meer dan drie perioden beslaat, telt als niet te dateren; een gebied zonder gedateerde vondsten
      staat er niet in.</p></section>`);
  }
  // the city's own Wikipedia article (pipeline/s06_wiki.py), after the first lines
  fetch(D + 'about.json').then(r => r.json()).then(a => {
    // its own escaping: this can run before the card code further down has defined esc()
    const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    for (const [lang, el, more] of [['en', en, 'Read more on Wikipedia'], ['nl', nl, 'Lees verder op Wikipedia']]) {
      const w = a[lang] || a.nl || a.en;
      if (!w) continue;
      el.querySelector('h2').nextElementSibling.insertAdjacentHTML('afterend', `<h3>${config.theme ? (lang === 'nl' ? `Over ${config.theme.noun[3]}` : `About ${config.theme.noun[1]}`) : lang === 'nl' ? 'Over de stad' : 'About the city'}</h3>
        <p lang="${a[lang] ? lang : 'nl'}">${esc(w.extract)} <a href="${esc(w.url)}" target="_blank" rel="noopener">${more}</a></p>`);
    }
  }).catch(() => {});
}

// ---------- Scene ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(SKY);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 5, 60000);
const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
// Left drag turns and tilts the city; right drag, or Shift with the left, moves it.
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.rotateSpeed = 0.6;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 60;
controls.maxDistance = 30000;

// The view the map opens on: the whole city, or the whole province of a theme.
function homeView() {
  const h = config.home, az = THREE.MathUtils.degToRad(h.azimuth), el = THREE.MathUtils.degToRad(h.elevation);
  const d = h.span * 0.9;
  return [new THREE.Vector3(h.x, 0, h.z),
    new THREE.Vector3(h.x + d * Math.cos(el) * Math.sin(az), d * Math.sin(el), h.z + d * Math.cos(el) * Math.cos(az))];
}
function goHome() {
  const [t, p] = homeView();
  controls.target.copy(t);
  camera.position.copy(p);
  controls.update();
}
goHome();

// Land and water: flat polygons in the local frame (see pipeline/s04_water.py).
async function loadPolygons(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const [nPoly, nRing, nVert] = new Uint32Array(buf, 0, 3);
  const ringStart = new Uint32Array(buf, 12, nPoly + 1);
  const vertStart = new Uint32Array(buf, 12 + 4 * (nPoly + 1), nRing + 1);
  const xz = new Float32Array(buf, 12 + 4 * (nPoly + 1) + 4 * (nRing + 1), 2 * nVert);
  const ring = r => {
    const pts = [];
    for (let v = vertStart[r]; v < vertStart[r + 1]; v++) pts.push(new THREE.Vector2(xz[2 * v], -xz[2 * v + 1]));
    return pts;
  };
  const shapes = [];
  for (let p = 0; p < nPoly; p++) {
    const shape = new THREE.Shape(ring(ringStart[p]));
    for (let r = ringStart[p] + 1; r < ringStart[p + 1]; r++) shape.holes.push(new THREE.Path(ring(r)));
    shapes.push(shape);
  }
  const g = new THREE.ShapeGeometry(shapes);
  g.rotateX(-Math.PI / 2);
  return g;
}
const flat = new THREE.Group();
scene.add(flat);
const [landGeo, waterGeo] = await Promise.all([loadPolygons(D + 'land.bin'), loadPolygons(D + 'water.bin')]);
const land = new THREE.Mesh(landGeo, new THREE.MeshBasicMaterial({ color: LAND }));
const water = new THREE.Mesh(waterGeo, new THREE.MeshBasicMaterial({ color: WATER }));
land.position.y = -0.05;
water.position.y = -0.4;
flat.add(land, water);

// ---------- Protected townscapes ----------
// The State's protected town and village views (pipeline/s04_water.py), on a toggle: a light wash on the ground and a
// red border drawn over the buildings, so the line can be followed through the streets.
const TOWNSCAPE = '#c8102e';
const townscapes = new THREE.Group();
townscapes.visible = false;
scene.add(townscapes);
const gzBtn = document.querySelector('.gz-toggle');
if (layers.some(L => L.id === 'townscapes' && L.count)) {
  Promise.all([loadPolygons(D + 'townscapes.bin'), loadPolygons(D + 'townscapes_edge.bin')]).then(([area, edge]) => {
    const wash = new THREE.Mesh(area, new THREE.MeshBasicMaterial({ color: TOWNSCAPE, transparent: true, opacity: 0.08, depthWrite: false }));
    const border = new THREE.Mesh(edge, new THREE.MeshBasicMaterial({ color: TOWNSCAPE, transparent: true, opacity: 0.85, depthTest: false }));
    wash.position.y = 0.1;
    border.position.y = 0.3;
    border.renderOrder = 5;
    townscapes.add(wash, border);
    gzBtn.hidden = false;
  }).catch(() => {});
}
gzBtn.onclick = () => {
  townscapes.visible = !townscapes.visible;
  gzBtn.setAttribute('aria-pressed', String(townscapes.visible));
};

// ---------- A theme: one kind of monument across a province ----------
// (cities/<theme>.json, pipeline/s00_theme_select.py) Every monument stands in a small diorama of its surroundings.
// From afar each is a marker: hovering one shows its card, a click flies there. Close up a windmill gets a turning
// cross of sails, an illustration: neither 3D BAG nor the 3D Basisvoorziening models sails.
const THEME = config.theme;
const MARKER_FAR = 2500;        // metres of camera distance above which markers lead and buildings are too small
let markerPts = null, freshPts = null, sails = [];
let markerKey = '';  // what the shown markers were last worked out for (stepTheme)
const periodIndex = y => Math.max(0, periods.findIndex(p => y >= p.from && y <= p.to));
const placeNames = [];
// the overview's markers, map and sails: drawn, but never picked as buildings (pick())
const themeGroup = new THREE.Group();
scene.add(themeGroup);
if (THEME) {
  controls.maxDistance = Math.max(controls.maxDistance, config.home.span * 1.6);
  camera.far = Math.max(camera.far, config.home.span * 5);
  camera.updateProjectionMatrix();
  goHome();  // again, now the province fits within maxDistance
  // In the order they were built, each with its year: playing the timeline shows them going up one by one.
  const M = THEME.markers;
  M.forEach(m => { m[8] = attrs.getInt16(m[2] * config.attrStride + 12, true); });
  M.sort((a, b) => a[8] - b[8]);
  const pos = new Float32Array(M.length * 3);
  M.forEach((m, i) => pos.set([m[0], m[3] + 6, m[1]], 3 * i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(M.length * 3), 3));
  markerPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 13, sizeAttenuation: false, map: markerTexture(),
    vertexColors: true, transparent: true, depthTest: false, alphaTest: 0.05 }));
  markerPts.renderOrder = 10;
  themeGroup.add(markerPts);
  // the ones just built, while the timeline plays: a ring around each
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', g.attributes.position);
  freshPts = new THREE.Points(fg, new THREE.PointsMaterial({ size: 34, sizeAttenuation: false, map: ringTexture(),
    color: '#ec0000', transparent: true, depthTest: false }));
  freshPts.renderOrder = 11;
  freshPts.visible = false;
  themeGroup.add(freshPts);
  // The province under the sites, with its municipalities' borders and names: something to find one's way by from afar.
  const P = THEME.map;
  const shape = r => new THREE.Shape(Array.from({ length: r.length / 2 }, (_, i) => new THREE.Vector2(r[2 * i], r[2 * i + 1])));
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(P.province.map(shape)).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: LAND, depthWrite: false, side: THREE.DoubleSide }));
  fill.position.y = -0.6;
  fill.renderOrder = -1;
  const seg = [];
  for (const r of P.borders) for (let i = 0; i + 3 < r.length; i += 2) seg.push(r[i], 0, r[i + 1], r[i + 2], 0, r[i + 3]);
  const borders = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(seg, 3)),
    new THREE.LineBasicMaterial({ color: '#b9b4a8' }));
  borders.position.y = 0.5;
  themeGroup.add(fill, borders);
  for (const [name, x, z] of P.names) {
    const s = textSprite(name);
    s.position.set(x, 30, z);
    placeNames.push(s);
    themeGroup.add(s);
  }
  // Sails: four slender blades on a hub, turned to the south-west (the prevailing wind), at the top of the body.
  const blade = (w, l) => new THREE.BoxGeometry(w, l, 0.3).translate(0, l / 2 + 0.6, 0);
  const sailMat = new THREE.MeshBasicMaterial({ color: '#4a3f35' });
  for (const m of M) {
    if (!m[7] || m[3] < 6) continue;
    // a mill's arms reach about as far as its body is high; the hub sits in front of the cap
    const L = Math.min(15, Math.max(8, m[3] * 0.8));
    const parts = [0, 1, 2, 3].map(k => blade(1.9, L).rotateZ(k * Math.PI / 2));
    const geo = mergeBoxes(parts);
    const hub = new THREE.Group();
    hub.position.set(m[0] - 3.5, Math.max(m[3] * 0.9, L + 1.5), m[1] + 3.5);
    hub.lookAt(m[0] - 30, hub.position.y, m[1] + 30);
    const cross = new THREE.Mesh(geo, sailMat);
    hub.userData.i = M.indexOf(m);
    cross.rotation.z = (m[2] % 7) * 0.4;
    hub.add(cross);
    themeGroup.add(hub);
    sails.push(cross);
  }
}
function markerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  // a white disc, tinted per marker, with the cross of sails cut out of it
  x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
  x.globalCompositeOperation = 'destination-out';
  x.lineWidth = 7; x.lineCap = 'round';
  x.beginPath(); x.moveTo(16, 16); x.lineTo(48, 48); x.moveTo(48, 16); x.lineTo(16, 48); x.stroke();
  return new THREE.CanvasTexture(c);
}
// Markers take the colours of the layer shown, like the buildings do; dark when none is.
function colorMarkers() {
  if (!markerPts) return;
  const L = uniforms.uMode.value === MODE.layers ? activeLayer : null, st = config.attrStride, c = new THREE.Color();
  const attr = markerPts.geometry.attributes.color;
  THEME.markers.forEach((m, i) => {
    const o = m[2] * st, lay0 = attrs.getUint32(o + 20, true), lay1 = attrs.getUint32(o + 24, true);
    const k = L ? L.groups.findIndex(g => groupOn[g.bit] !== false && (g.bit < 32 ? (lay0 >>> g.bit) & 1 : (lay1 >>> (g.bit - 32)) & 1)) : -1;
    c.set(!L ? '#1b1b1b' : k >= 0 && k < MAX_GROUPS ? GROUP_COLORS[k] : '#c9c5bb');
    attr.setXYZ(i, c.r, c.g, c.b);
  });
  attr.needsUpdate = true;
}
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.arc(32, 32, 27, 0, 7); x.stroke();
  return new THREE.CanvasTexture(c);
}
function textSprite(text) {
  const c = document.createElement('canvas'), x = c.getContext('2d'), px = 40;
  x.font = `500 ${px}px system-ui, sans-serif`;
  c.width = Math.ceil(x.measureText(text).width) + 16; c.height = px + 16;
  x.font = `500 ${px}px system-ui, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 8; x.strokeStyle = 'rgba(244,243,239,0.9)'; x.strokeText(text, c.width / 2, c.height / 2);
  x.fillStyle = '#8a867c'; x.fillText(text, c.width / 2, c.height / 2);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), sizeAttenuation: false,
    depthTest: false, transparent: true }));
  const h = 0.016;
  s.scale.set(h * c.width / c.height, h, 1);
  s.renderOrder = 9;
  return s;
}
function mergeBoxes(parts) {
  let n = 0;
  const pos = [], idx = [];
  for (const p of parts) {
    pos.push(...p.attributes.position.array);
    idx.push(...p.index.array.map(i => i + n));
    n += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
// The marker nearest the pointer on screen, within reach; while the camera is far out.
const markerScreen = new THREE.Vector3();
function markerAt(x, y) {
  if (!THEME || camera.position.distanceTo(controls.target) < MARKER_FAR) return null;
  let best = null, bd = 14;
  for (const m of THEME.markers) {
    if (!m[9]) continue;  // not built yet, or of a period not shown (stepTheme)
    markerScreen.set(m[0], m[3] + 6, m[1]).project(camera);
    const d = Math.hypot((markerScreen.x + 1) / 2 * innerWidth - x, (1 - markerScreen.y) / 2 * innerHeight - y);
    if (markerScreen.z < 1 && d < bd) { bd = d; best = m; }
  }
  return best;
}
function stepTheme(now, dist) {
  if (!THEME) return;
  markerPts.material.opacity = Math.max(0, Math.min(1, (dist - 900) / 1600));
  markerPts.visible = markerPts.material.opacity > 0;
  // Only the mills standing in the year shown and, like the buildings, in the periods picked in the legend; while
  // playing, the ones built in the last moments get a ring.
  const M = THEME.markers, Y = uniforms.uYear.value;
  const masked = uniforms.uMode.value === MODE.period;
  let built = 0;
  while (built < M.length && M[built][8] <= Y) built++;
  let fresh = built;
  while (playing && fresh > 0 && M[fresh - 1][8] > Y - uniforms.uRise.value * 2) fresh--;
  const key = `${built} ${fresh} ${masked ? maskTarget.join('') : ''}`;
  if (key !== markerKey) {
    markerKey = key;
    const all = [], recent = [];
    M.forEach((m, i) => {
      m[9] = i < built && (!masked || !!maskTarget[periodIndex(m[8])]);
      if (m[9]) (i >= fresh ? recent : all).push(i);
    });
    markerPts.geometry.setIndex([...all, ...recent]);
    freshPts.geometry.setIndex(recent);
    for (const s of sails) s.parent.visible = M[s.parent.userData.i][9];
  }
  freshPts.visible = markerPts.visible && freshPts.geometry.index.count > 0;
  freshPts.material.opacity = markerPts.material.opacity;
  const names = Math.max(0, Math.min(1, (dist - 12000) / 8000));
  for (const s of placeNames) { s.material.opacity = names; s.visible = names > 0; }
  const spin = now / 1000 * 0.9;
  sails.forEach((s, i) => { s.rotation.z = spin + i * 0.7; });
}

// ---------- Archaeology ----------
// A second city under the first (pipeline/s17_archeo.py). The toggle turns the map over: the camera swings through
// the ground to look up at the city from below, the buildings fade to a pale maquette and the ground turns to glass.
// Under it every research area (onderzoeksgebied) lies once for each archaeological period its finds and features
// date from, the deeper the older: ten periods of the ABR, from Recent down to the Palaeolithic. Depth stands for
// time, not for metres below the surface. Only what the RCE marks as public is there.
const ARCH_DEPTH = 28;          // metres between two periods' layers
const ARCH_CENTRE = -ARCH_DEPTH * 3;
const UNDERGROUND = '#2a2621';
const ARCH = { on: false, data: null, meshes: [], edges: [], mask: [], focus: null, terrains: null };
const archGroup = new THREE.Group();
archGroup.visible = false;
scene.add(archGroup);
const archBtn = document.querySelector('.arch-toggle');
if (config.archeology) archBtn.hidden = false;
archBtn.onclick = () => setArcheo(!ARCH.on);

// The polygons of a file in s04_water's format, one THREE.Shape each, in file order.
function shapesOf(buf) {
  const [nPoly, nRing, nVert] = new Uint32Array(buf, 0, 3);
  const ringStart = new Uint32Array(buf, 12, nPoly + 1);
  const vertStart = new Uint32Array(buf, 12 + 4 * (nPoly + 1), nRing + 1);
  const xz = new Float32Array(buf, 12 + 4 * (nPoly + 1) + 4 * (nRing + 1), 2 * nVert);
  const ring = r => {
    const pts = [];
    for (let v = vertStart[r]; v < vertStart[r + 1]; v++) pts.push(new THREE.Vector2(xz[2 * v], -xz[2 * v + 1]));
    return pts;
  };
  const out = [];
  for (let p = 0; p < nPoly; p++) {
    const shape = new THREE.Shape(ring(ringStart[p]));
    for (let r = ringStart[p] + 1; r < ringStart[p + 1]; r++) shape.holes.push(new THREE.Path(ring(r)));
    out.push(shape);
  }
  return out;
}
// One mesh per period: the areas that hold something from it, with an edge so neighbouring areas stay apart.
function archLayerMesh(shapes, color, opacity, y) {
  const g = new THREE.ShapeGeometry(shapes);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  mesh.position.y = edge.position.y = y;
  return [mesh, edge];
}
let archLoading = null;
function loadArcheo() {
  archLoading ??= Promise.all([
    fetch(D + 'archeo/areas.json').then(r => r.json()),
    fetch(D + 'archeo/areas.bin').then(r => r.arrayBuffer()),
    fetch(D + 'archeo/terrains.bin').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null),
  ]).then(([data, buf, tbuf]) => {
    ARCH.data = data;
    ARCH.polys = shapesOf(buf);
    ARCH.mask = data.layers.map(() => 1);
    data.layers.forEach((L, i) => {
      const shapes = [], owner = [];
      data.areas.forEach((a, k) => {
        if (!(a.mask >> i & 1)) return;
        for (let p = a.poly[0]; p < a.poly[0] + a.poly[1]; p++) { shapes.push(ARCH.polys[p]); owner.push(k); }
      });
      const [mesh, edge] = archLayerMesh(shapes, L.color, 0.6, -(i + 1) * ARCH_DEPTH);
      mesh.userData = { layer: i, owner };
      archGroup.add(mesh, edge);
      ARCH.meshes.push(mesh); ARCH.edges.push(edge);
    });
    // The protected sites (archaeological rijksmonumenten) just under the surface, in the townscapes' red.
    if (tbuf && data.terrains.length) {
      const t = shapesOf(tbuf);
      const [wash, border] = archLayerMesh(t, TOWNSCAPE, 0.35, -3);
      wash.userData = { terrain: true, owner: data.terrains.flatMap((x, k) => Array(x.poly[1]).fill(k)) };
      ARCH.terrains = [wash, border];
      archGroup.add(wash, border);
    }
  });
  return archLoading;
}

// Turning over: the camera swings through the ground plane to the mirror image of where it was, around a point
// in the middle of the layers, and back.
let flip = null;
function setArcheo(on) {
  if (on === ARCH.on) return;
  ARCH.on = on;
  archBtn.setAttribute('aria-pressed', String(on));
  document.body.classList.toggle('archeo', on);
  pinCard(-1);
  if (on) loadArcheo().then(() => { archGroup.visible = ARCH.on; renderPanel(); drawHist(); });
  else archGroup.visible = false;
  const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI * 0.97;
  flip = { t0: performance.now(), dur: 1400, from: sph.phi, theta: sph.theta, r: sph.radius,
    to: on ? Math.max(Math.PI * 0.6, Math.PI - sph.phi) : Math.min(Math.PI * 0.45, Math.PI - sph.phi),
    fromY: controls.target.y, toY: on ? ARCH_CENTRE : 0,
    done: () => { controls.minPolarAngle = on ? Math.PI * 0.55 : 0; controls.maxPolarAngle = on ? Math.PI * 0.97 : Math.PI * 0.47; } };
  uniforms.uGhost.value = on ? 0.72 : 0;
  for (const [m, o] of [[land, 0.28], [water, 0.35]]) {
    m.material.transparent = on; m.material.opacity = on ? o : 1; m.material.depthWrite = !on; m.material.needsUpdate = true;
  }
  renderer.setClearColor(on ? UNDERGROUND : SKY);
  uniforms.uFogColor.value = col(on ? UNDERGROUND : SKY);
  labelGroup.visible = !on;
  if (on) { ARCH.townscapes = townscapes.visible; townscapes.visible = false; } else townscapes.visible = !!ARCH.townscapes;
  walkGroup.visible = !on;
  document.querySelector('.graph-open').href = graphHref();
  const u = new URL(location.href);
  if (on) u.searchParams.set('mode', 'archeo'); else { u.searchParams.delete('mode'); u.searchParams.delete('focus'); }
  history.replaceState(null, '', u);
  if (!on) { ARCH.focus = null; archFocusMeshes(); focusEl.hidden = true; }
  // the about text leads with archaeology while the city is turned over
  document.querySelectorAll('#about article').forEach(a => {
    const sec = a.querySelector('.about-arch');
    if (sec) on ? a.querySelector('h2').after(sec) : a.append(sec);
  });
  applyStaticText(); renderPanel(); drawHist();
}
function stepFlip(now) {
  if (!flip) return;
  const k = Math.min(1, (now - flip.t0) / flip.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  controls.target.y = flip.fromY + (flip.toY - flip.fromY) * e;
  const off = new THREE.Vector3().setFromSpherical(new THREE.Spherical(flip.r, flip.from + (flip.to - flip.from) * e, flip.theta));
  camera.position.copy(controls.target).add(off);
  if (k >= 1) { const d = flip.done; flip = null; d(); }
}
function graphHref() {
  const q = new URLSearchParams();
  const cq = new URLSearchParams(location.search).get('city');
  if (cq) q.set('city', cq);
  if (ARCH.on) q.set('mode', 'archeo');
  if (LANG === 'nl') q.set('lang', 'nl');
  return 'graph.html' + (q.size ? '?' + q : '');
}

// A click under the ground: the area under the pointer, at the shallowest period showing there.
const archRay = new THREE.Raycaster();
function archAt(x, y) {
  archRay.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const targets = [...ARCH.meshes.filter(m => m.visible), ...(ARCH.terrains ? [ARCH.terrains[0]] : [])];
  const hit = archRay.intersectObjects(targets, false)[0];
  if (!hit) return null;
  const g = hit.object.geometry.groups.find(g => hit.faceIndex * 3 >= g.start && hit.faceIndex * 3 < g.start + g.count);
  const k = hit.object.userData.owner[g ? g.materialIndex : 0];
  return hit.object.userData.terrain ? { terrain: k } : { area: k, layer: hit.object.userData.layer };
}
const termLink = ([label, uri, n]) => `<li>${uri ? link(uri, label) : esc(label)} <small>${n}</small></li>`;
function archCardHtml(hit) {
  const D_ = ARCH.data, ldv = uri => `<p class="ldv">${t('In the Linked Data Voorziening')}: ${link(uri, uri)}</p>`;
  if (hit.terrain !== undefined) {
    const s = D_.terrains[hit.terrain];
    return `<button class="card-close" aria-label="Close">×</button>
      <header class="card-head" style="background:${TOWNSCAPE};color:#fff"><h3>${esc(s.name || t('Archaeological monument'))}</h3>
        <div class="when"><span class="period">${t('Archaeological national monument')}</span></div></header>
      <section class="register"><p class="extract" lang="nl">${esc(s.txt)}</p>
        <p class="reg-main">${link(`https://monumentenregister.cultureelerfgoed.nl/monumenten/${s.nr}`, `${t('View in the Rijksmonumentenregister')} (${LANG === 'nl' ? 'nr.' : 'no.'} ${s.nr})`)}</p>
        ${ldv(s.cho)}</section>`;
  }
  const a = D_.areas[hit.area], L = D_.layers[hit.layer];
  const name = l => LANG === 'nl' ? l.label : l.label_en;
  const list = (title, rows) => rows.length ? `<section><h4>${title}</h4><ul class="terms">${rows.map(termLink).join('')}</ul></section>` : '';
  const c = a.counts;
  return `<button class="card-close" aria-label="Close">×</button>
    <header class="card-head" style="background:${L.color};color:${inkOn(L.color)}"><h3>${esc(a.name)}</h3>
      <p class="addr"><span>${t('Research area')} ${esc(a.nr)}${a.registered ? ` · ${t('registered')} ${a.registered}` : ''}</span></p>
      <div class="when"><span class="y">${esc(name(L))}</span><span class="period">${esc(archYears(L))}</span></div></header>
    <section><h4>${t('Periods found here')}</h4><ul class="terms">${D_.layers.map((l, i) => a.mask >> i & 1
      ? `<li><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${l.color}"></i> ${link(l.uri, name(l))}</li>` : '').join('')}</ul></section>
    <section><dl><dt>${t('Archaeological complexes')}</dt><dd>${fmt(c.complexes)}</dd><dt>${t('Features')}</dt><dd>${fmt(c.features)}</dd>
      <dt>${t('Finds')}</dt><dd>${fmt(c.objects)}</dd></dl></section>
    ${list(t('Archaeological complexes'), a.complexes)}${list(t('Features'), a.features)}
    ${list(t('Finds'), a.finds)}${list(t('Materials'), a.materials)}
    ${a.spots.length ? `<section><h4>${t('Find spots')}</h4><ul class="terms">${a.spots.map(s =>
      `<li>${link(s.cho, s.name || t('Find spot'))}${s.how ? ` <small>${esc(s.how.replace(/^archeologisch: /, ''))}</small>` : ''}</li>`).join('')}</ul></section>` : ''}
    <section class="register arch-card">${ldv(a.cho)}<p class="why">${t('Terms from the Referentienetwerk (ABR); only public records.')}</p></section>`;
}
const archYears = L => `${L.begin < 0 ? `${-L.begin} ${LANG === 'nl' ? 'v.Chr.' : 'BC'}` : L.begin}–${L.end < 0 ? `${-L.end} ${LANG === 'nl' ? 'v.Chr.' : 'BC'}` : L.end}`;
function archClick(x, y) {
  const hit = archAt(x, y);
  if (!hit) { card.hidden = true; return; }
  card.innerHTML = archCardHtml(hit);
  card.classList.add('pinned', 'arch-card');
  card.hidden = false;
  card.querySelector('.card-close').onclick = () => { card.hidden = true; card.classList.remove('arch-card'); };
  placeCard(x, y);
}
function renderArcheoPanel() {
  const D_ = ARCH.data;
  if (!D_) { panel.innerHTML = `<h2>${t('Under the ground')}</h2><p class="note">${t('Loading…')}</p>`; return; }
  const name = l => LANG === 'nl' ? l.label : l.label_en;
  panel.innerHTML = `<h2>${t('Under the ground')}</h2>
    <p class="note">${t('Every surface is a research area, once for each period its finds and features date from: the deeper, the older.')}</p>
    <div class="swatches">${D_.layers.map((l, i) => `
      <button class="swatch" data-i="${i}" aria-pressed="${!!ARCH.mask[i]}">
        <i style="background:${l.color}"></i><span>${esc(name(l))} <small>${esc(archYears(l))}</small></span><span class="n">${fmt(l.count)}</span>
      </button>`).join('')}
      ${D_.terrains.length ? `<button class="swatch" data-t="1" aria-pressed="${ARCH.terrains?.[0].visible !== false}">
        <i style="background:${TOWNSCAPE}"></i><span>${t('Archaeological national monuments')}</span><span class="n">${fmt(D_.terrains.length)}</span></button>` : ''}</div>
    <p class="note">${t('Click a period to see it alone; click a surface for what was found there. Periods and terms from the Referentienetwerk (ABR), records from the RCE Linked Data Voorziening; only what is public.')}</p>`;
  panel.querySelectorAll('.swatch[data-i]').forEach(b => b.onclick = () => {
    const i = +b.dataset.i, m = ARCH.mask, solo = m.every((v, j) => (j === i) === !!v);
    ARCH.mask = D_.layers.map((_, j) => (solo || j === i) ? 1 : 0);
    ARCH.meshes.forEach((x, j) => { x.visible = ARCH.edges[j].visible = !!ARCH.mask[j]; });
    archFocusMeshes();
    renderPanel();
  });
  panel.querySelector('.swatch[data-t]')?.addEventListener('click', () => {
    ARCH.terrains.forEach(x => { x.visible = !x.visible; });
    renderPanel();
  });
}
// From the graph: the areas of the chosen terms light up in their colours, the rest of the layers dim.
let archFocusGroup = null;
function archFocusMeshes() {
  if (archFocusGroup) { archGroup.remove(archFocusGroup); archFocusGroup = null; }
  const dim = !!ARCH.focus;
  ARCH.meshes.forEach(m => { m.material.opacity = dim ? 0.12 : 0.6; });
  if (!ARCH.focus) return;
  archFocusGroup = new THREE.Group();
  ARCH.focus.forEach(({ areas, color }) => ARCH.data.layers.forEach((L, i) => {
    if (!ARCH.mask[i]) return;
    const shapes = [];
    areas.forEach(k => { const a = ARCH.data.areas[k]; if (a.mask >> i & 1) for (let p = a.poly[0]; p < a.poly[0] + a.poly[1]; p++) shapes.push(ARCH.polys[p]); });
    if (shapes.length) archFocusGroup.add(...archLayerMesh(shapes, GROUP_COLORS[color], 0.85, -(i + 1) * ARCH_DEPTH + 0.5));
  }));
  archGroup.add(archFocusGroup);
}
async function showArcheoFocus(ids) {
  await loadArcheo();
  const G = await fetch(D + 'archeo/graph.json').then(r => r.json());
  const index = new Map(ARCH.data.areas.map((a, k) => [String(a.nr), k]));
  ARCH.focus = ids.map((id, i) => {
    const place = G.places[id], node = G.nodes.find(n => n.id === id);
    const nrs = place ? place.areas : G.links.filter(l => l.e === id).flatMap(l => G.places[l.p].areas);
    return { label: place ? place.name : (LANG === 'nl' ? node?.label_nl : node?.label) || id, color: i % GROUP_COLORS.length,
      areas: [...new Set(nrs.map(n => index.get(String(n))).filter(k => k !== undefined))] };
  }).filter(f => f.areas.length);
  archFocusMeshes();
  const back = graphHref().replace('graph.html?', `graph.html?select=${encodeURIComponent(ids.join(','))}&`);
  focusEl.innerHTML = `<header><b>${t('From the graph')}</b><button class="f-close" aria-label="${t('Close')}">×</button></header>
    <ul>${ARCH.focus.map(f => `<li><i style="background:${GROUP_COLORS[f.color]}"></i><span>${esc(f.label)}</span><small>${f.areas.length}</small></li>`).join('')}</ul>
    <div class="f-actions"><a class="f-back" href="${back}">${t('Back to the graph')}</a></div>`;
  focusEl.hidden = false;
  focusEl.querySelector('.f-close').onclick = () => { ARCH.focus = null; archFocusMeshes(); focusEl.hidden = true; };
}

// ---------- Street and canal names ----------
// Flat on the ground, turned along the street (pipeline/s07_labels.py). Textures are drawn on first use.
const labelData = await fetch(D + 'labels.json').then(r => r.json());
const labelGroup = new THREE.Group();
scene.add(labelGroup);
const labelTex = new Map();
const LABEL_PX = 64;
function textureFor(L) {
  let t = labelTex.get(L.name + L.water);
  if (t) return t;
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const font = `${L.water ? 'italic 500' : '500'} ${LABEL_PX * 0.62}px "Schibsted Grotesk", sans-serif`;
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(L.name).width + LABEL_PX * 0.4);
  c.height = LABEL_PX;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = LABEL_PX * 0.12;
  ctx.strokeStyle = L.water ? 'rgba(181,199,198,0.85)' : 'rgba(244,243,239,0.85)';
  ctx.fillStyle = L.water ? '#3c6875' : '#50565b';
  ctx.strokeText(L.name, LABEL_PX * 0.2, LABEL_PX / 2);
  ctx.fillText(L.name, LABEL_PX * 0.2, LABEL_PX / 2);
  t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.userData = { aspect: c.width / c.height };
  labelTex.set(L.name + L.water, t);
  return t;
}
const labelPlane = new THREE.PlaneGeometry(1, 1);
const labels = labelData.flatMap(L => L.pts.map(([x, z, ang, len, wid]) => ({ L, x, z, ang, len, wid: wid || 20, mesh: null })))
  .sort((a, b) => a.L.tier - b.L.tier || b.len - a.len);
function updateLabels(dist) {
  if (!document.fonts.check('500 16px "Schibsted Grotesk"')) return;
  // Label height in metres, roughly constant on screen; the canals and main streets read larger.
  const h1 = THREE.MathUtils.clamp(dist * 0.014, 4, 44), h2 = THREE.MathUtils.clamp(dist * 0.01, 3, 15);
  // Names appear only when the camera comes close: canals and main streets first, the rest closer still.
  const near = dist * 1.2, far = dist * 2;
  // Greedy collision: canals and main streets first, then the longest stretches; a label is dropped
  // when an accepted one already sits within a few label heights of it.
  const taken = new Map(), C = h1 * 5; // one grid, cells as wide as the largest separation
  const cellOf = (x, z) => `${Math.floor(x / C)},${Math.floor(z / C)}`;
  const clear = (l, sep) => {
    const cx = Math.floor(l.x / C), cz = Math.floor(l.z / C);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      for (const q of taken.get(`${cx + i},${cz + j}`) || []) if ((q.x - l.x) ** 2 + (q.z - l.z) ** 2 < sep * sep) return false;
    }
    return true;
  };
  for (const l of labels) {
    const d = Math.hypot(l.x - camera.position.x, l.z - camera.position.z);
    let show = d < (l.L.tier === 1 ? far : near) && dist < (l.L.tier === 1 ? 3200 : 1300);
    const sep = (l.L.tier === 1 ? h1 : h2) * 5;
    if (show && !clear(l, sep)) show = false;
    if (show) {
      const key = cellOf(l.x, l.z);
      if (!taken.has(key)) taken.set(key, []);
      taken.get(key).push(l);
    }
    if (show && !l.mesh) {
      const tex = textureFor(l.L);
      l.mesh = new THREE.Mesh(labelPlane, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      // Turn about the vertical first, then lay the plane flat.
      l.mesh.rotation.set(-Math.PI / 2, THREE.MathUtils.degToRad(-l.ang), 0, "YXZ"); // ang is measured towards +z, Y turns towards -z
      l.mesh.position.set(l.x, l.L.water ? 0.4 : 0.6, l.z);
      l.mesh.renderOrder = 2;
      labelGroup.add(l.mesh);
    }
    if (l.mesh) {
      // Never taller than the street or canal is wide, so a name stays off the buildings.
      const h = Math.min(l.L.tier === 1 ? h1 : h2, l.wid * 0.55);
      const w = h * l.mesh.material.map.userData.aspect;
      // A name much longer than its stretch of street would spill over the buildings.
      if (show && (w > l.len * 1.1 || h < 2.5)) show = false;
      l.mesh.visible = show;
      if (show) l.mesh.scale.set(w, h, 1);
    }
  }
}

// ---------- Shared uniforms ----------
const col = c => new THREE.Color(c);
const uniforms = {
  uYear: { value: config.yearMax },
  uYearFrom: { value: config.yearMin - 1 },
  uMode: { value: MODE.period },
  uPalette: { value: periods.map(p => col(p.color)) },
  uMask: { value: periods.map(() => 1) },
  uNow: { value: 0 },                              // seconds, for tiles dropping in as they load
  uPlaying: { value: 0 },                          // while the film plays buildings fly in rather than grow
  uRise: { value: 0.01 },
  uLayerAt: { value: -10 },                        // seconds; when a context layer opened, its buildings rise                          // years a building's entrance spans; only the film widens it
  uGroupBit: { value: Array(MAX_GROUPS).fill(-1) },
  uGroupColor: { value: GROUP_COLORS.map(col) },
  uMaquette: { value: col(MAQUETTE) },
  uEnergy: { value: ENERGY_COLORS.map(col) },
  uHover: { value: -1 },
  uSelected: { value: -1 },
  uFocusN: { value: 0 },                           // buildings lit by a walk or the graph (their groups are in uPick)
  uBlind: { value: 0 },
  // Per building: .x lit by the search (while uPickOn is 1 the found buildings keep their colour and the rest dims),
  // .y its walk or graph group + 1 (0: not lit). A texture, not uniform arrays: phones such as Adreno allow only
  // 256 vertex uniform vectors, and arrays of a building per element left the shader unlinked and the city empty.
  uPick: { value: null },
  uPickOn: { value: 0 },
  uFogColor: { value: col(SKY) },
  uGhost: { value: 0 },                            // archaeology mode: the buildings fade to a pale maquette
  uFog: { value: new THREE.Vector2(9000, 26000) },
};

const PICK_ROWS = Math.ceil(config.stats.buildings / ATTR_W);
const pickData = new Uint8Array(ATTR_W * PICK_ROWS * 4);
const pickTex = new THREE.DataTexture(pickData, ATTR_W, PICK_ROWS, THREE.RGBAFormat, THREE.UnsignedByteType);
pickTex.needsUpdate = true;
uniforms.uPick.value = pickTex;

const VERT = /* glsl */`
  in float bld;
  uniform sampler2D uAttr;
  uniform float uYear, uYearFrom, uMode, uHover, uSelected, uBlind, uNow, uBorn, uPlaying, uRise, uLayerAt;
  uniform vec3 uPalette[${periods.length}];
  uniform float uMask[${periods.length}];
  uniform int uGroupBit[${MAX_GROUPS}];
  uniform vec3 uGroupColor[${MAX_GROUPS}];
  uniform vec3 uMaquette;
  uniform vec3 uEnergy[13];
  uniform int uFocusN;
  uniform sampler2D uPick;
  uniform float uPickOn;
  out vec3 vColor;
  out vec3 vWorld;
  out float vGid;

  vec3 floorsRamp(float f) {
    float t = clamp(log(f) / log(40.0), 0.0, 1.0);
    vec3 a = vec3(0.86, 0.89, 0.90), b = vec3(0.49, 0.66, 0.75), c = vec3(0.17, 0.36, 0.55), d = vec3(0.05, 0.10, 0.25);
    return t < 0.33 ? mix(a, b, t / 0.33) : t < 0.66 ? mix(b, c, (t - 0.33) / 0.33) : mix(c, d, (t - 0.66) / 0.34);
  }

  bool hasBit(vec4 words, int bit) {
    int w = bit / 16;
    float v = w == 0 ? words.x : w == 1 ? words.y : w == 2 ? words.z : words.w;
    return ((int(v + 0.5) >> (bit - w * 16)) & 1) == 1;
  }

  void main() {
    int i = int(bld + 0.5);
    ivec2 tc = ivec2(2 * (i % ${ATTR_W}), i / ${ATTR_W});
    vec4 a = texelFetch(uAttr, tc, 0);
    vec4 lay = texelFetch(uAttr, tc + ivec2(1, 0), 0);
    float year = a.x;
    int pf = int(a.y + 0.5);
    int period = pf % 16;
    int flag = pf / 16;
    vGid = a.w;
    float vis = uMode < 1.5 ? uMask[period] : 1.0;
    float g = clamp((uYear - year + 1.0) / uRise, 0.0, 1.0);
    g = g * g * (3.0 - 2.0 * g);
    if (g <= 0.003 || vis <= 0.003) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }

    // Entrances, only while the film plays and while tiles load: a building drops in from its own side of the
    // sky, the same side every time (seeded by its id). Filters and scrubbing change the city at once.
    vec3 p = position;
    float seed = fract(sin(a.w * 12.9898) * 43758.5453);
    float arrive = clamp((uNow - uBorn) / 0.9 - seed * 0.35, 0.0, 1.0);
    float fly = 1.0 - arrive;
    if (uPlaying > 0.5) fly = max(fly, 1.0 - g);
    if (fly > 0.0) {
      float e = fly * fly * fly;
      float ang = seed * 6.2831853;
      // positions are in decimetres: a few hundred metres sideways and up
      p += vec3(cos(ang), 0.0, sin(ang)) * (1800.0 + 1600.0 * fract(seed * 7.13)) * e;
      p.y += (2600.0 + 2400.0 * fract(seed * 3.71)) * e;
    }
    vec3 c;
    if (uMode < 0.5) {
      c = uPalette[period];
      if (flag == 1 || flag == 2 || flag == 4) c = mix(c, uMaquette, 0.45);
    } else if (uMode < 1.5) {
      c = floorsRamp(mod(a.z, 128.0));
    } else if (uMode < 2.5) {
      c = uEnergy[int(a.z / 128.0)];
    } else {
      c = uMaquette;
      for (int g = 0; g < ${MAX_GROUPS}; g++) {
        if (uGroupBit[g] >= 0 && hasBit(lay, uGroupBit[g])) {
          c = uGroupColor[g];
          // Opening a layer: its buildings rise out of the ground in a quick wave, overshoot a little, settle.
          float k = clamp((uNow - uLayerAt) / 0.55 - seed * 0.6, 0.0, 1.0);
          float q = k - 1.0;
          p.y *= 1.0 + 2.70158 * q * q * q + 1.70158 * q * q;
          break;
        }
      }
    }
    if (uFocusN > 0) {
      int gi = int(vGid + 0.5);
      int fg = int(texelFetch(uPick, ivec2(gi % ${ATTR_W}, gi / ${ATTR_W}), 0).y * 255.0 + 0.5);
      c = fg > 0 ? uGroupColor[fg - 1] : uMaquette;
    }
    if (year <= uYearFrom) c = mix(c, uMaquette, 0.8);
    // A quest's question about one building turns it red; a year riddle also hides every other age.
    if (uBlind > 0.5 && vGid == uSelected) c = vec3(0.925, 0.0, 0.0);
    else if (uBlind > 0.5 && uBlind < 1.5) c = uMaquette;
    if (vGid == uHover || (vGid == uSelected && uBlind < 0.5)) c = mix(c, vec3(0.0), 0.35);
    if (uPickOn > 0.5) {
      int gi = int(vGid + 0.5);
      if (texelFetch(uPick, ivec2(gi % ${ATTR_W}, gi / ${ATTR_W}), 0).x < 0.5) c = mix(c, uMaquette, 0.78);
    }
    vColor = c;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uFogColor;
  uniform vec2 uFog;
  uniform float uGhost;
  in vec3 vColor;
  in vec3 vWorld;
  in float vGid;
  out vec4 outColor;
  void main() {
    #ifdef PICK
      float id = vGid + 1.0;
      outColor = vec4(mod(id, 256.0), mod(floor(id / 256.0), 256.0), floor(id / 65536.0), 255.0) / 255.0;
    #else
      vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      // Low afternoon sun from the south-west, a soft sky from above.
      float sun = max(dot(n, normalize(vec3(-0.55, 0.55, 0.62))), 0.0);
      float light = n.y > 0.9 ? 1.04 : 0.66 + 0.34 * sun;
      float foot = mix(0.82, 1.0, clamp(vWorld.y / 12.0, 0.0, 1.0));
      vec3 c = vColor * light * foot;
      float d = length(vWorld - cameraPosition);
      c = mix(c, vec3(0.93, 0.92, 0.89), uGhost);
      c = mix(c, uFogColor, smoothstep(uFog.x, uFog.y, d));
      outColor = vec4(c, 1.0);
    #endif
  }
`;

function makeMaterial(tex, pick, born) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { ...uniforms, uAttr: { value: tex }, uBorn: born },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: pick ? { PICK: 1 } : {},
    side: THREE.DoubleSide,
  });
}

// ---------- Tiles ----------
const meshes = [];
let loaded = 0;
const queue = [...config.tiles];
const pool = Array.from({ length: WORKERS }, () => new Worker('worker.js', { type: 'module' }));

function addTile(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('bld', new THREE.BufferAttribute(m.bld, 1));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  const rows = Math.ceil(m.nB / ATTR_W);
  const data = new Float32Array(ATTR_W * 2 * rows * 4);
  data.set(m.attr);
  const tex = new THREE.DataTexture(data, ATTR_W * 2, rows, THREE.RGBAFormat, THREE.FloatType);
  tex.needsUpdate = true;
  const born = { value: performance.now() / 1000 };
  const mesh = new THREE.Mesh(g, makeMaterial(tex, false, born));
  mesh.userData = { draw: mesh.material, pick: makeMaterial(tex, true, born) };
  mesh.scale.setScalar(0.1);
  mesh.position.set(m.origin[0], 0, m.origin[1]);
  scene.add(mesh);
  meshes.push(mesh);
}

// Tiles come in packs (see pipeline/s03_tiles.py); a tile is ready once its pack has arrived.
const packs = Object.fromEntries(config.packs.map(name => [name, fetch(`${D}${name}`).then(r => r.arrayBuffer())]));
for (const w of pool) {
  const next = async () => {
    const t = queue.shift();
    if (!t) return;
    const buf = (await packs[t.pack]).slice(t.offset, t.offset + t.length);
    w.postMessage({ buf, id: t.file }, [buf]);
  };
  w.onmessage = ({ data }) => {
    addTile(data);
    loaded++;
    document.getElementById('progress').textContent = Math.round(100 * loaded / config.tiles.length);
    if (loaded === config.tiles.length) { document.getElementById('loading').hidden = true; openDeepLink(); }
    next();
  };
  next();
}

// ---------- Picking ----------
const pickTarget = new THREE.WebGLRenderTarget(1, 1);
const pickPixel = new Uint8Array(4);
function pick(x, y) {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  camera.setViewOffset(w, h, x, y, 1, 1);
  for (const m of meshes) m.material = m.userData.pick;
  flat.visible = false;
  labelGroup.visible = false;
  themeGroup.visible = false;
  renderer.setRenderTarget(pickTarget);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pickPixel);
  renderer.setRenderTarget(null);
  renderer.setClearColor(SKY, 1);
  flat.visible = true;
  labelGroup.visible = true;
  themeGroup.visible = true;
  for (const m of meshes) m.material = m.userData.draw;
  camera.clearViewOffset();
  return pickPixel[0] + pickPixel[1] * 256 + pickPixel[2] * 65536 - 1;
}

// ---------- Building lookup ----------
const DATE_NOTE = [
  null,
  'The register gives a round year here, more often than neighbouring years predict. Read it as “around then”.',
  'The register has no real year (placeholder 1005, or one of the surplus 1905s of the old centre). Estimated from the nearest dated buildings.',
  'Year from the register of national monuments, which dates the building earlier than BAG does.',
  'Dated by the register of national monuments to a century or part of one; the map spreads it across that span.',
  'Year from Wikidata, which dates the building earlier than BAG does; the register of national monuments gives no date.',
];
const residentsLayer = layers.find(L => L.id === 'residents');
const contextLayers = layers;
// The card shows residents in their own section, so they are left out of its list of layers.
const groupsByBit = layers.filter(L => L !== residentsLayer).flatMap(L => L.groups.map(g => ({ ...g, layer: L })));

function building(gid) {
  const o = gid * config.attrStride;
  const lay0 = attrs.getUint32(o + 20, true), lay1 = attrs.getUint32(o + 24, true);
  return {
    gid,
    bag: String(attrs.getFloat64(o, true)).padStart(16, '0'),
    height: attrs.getUint16(o + 8, true) / 10,
    fsrc: attrs.getUint8(o + 10),
    flag: attrs.getUint8(o + 11),
    year: attrs.getInt16(o + 12, true),
    orig: attrs.getInt16(o + 14, true),
    mon: attrs.getUint32(o + 16, true),
    wk: attrs.getInt32(o + 28, true),
    energy: attrs.getUint8(o + 32),
    x: attrs.getFloat32(o + 36, true),
    z: attrs.getFloat32(o + 40, true),
    groups: groupsByBit.filter(g => g.bit < 32 ? (lay0 >>> g.bit) & 1 : (lay1 >>> (g.bit - 32)) & 1),
  };
}

const periodOf = y => periods.find(p => y >= p.from && y <= p.to) || periods[0];

// ---------- Building card ----------
// Hover shows a light card that follows the pointer; a click pins it, with the article extract and links.
let wiki = [], didYouKnow = {};
fetch(D + 'wiki.json').then(r => r.json()).then(w => { wiki = w; });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const link = (href, text) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(text)}</a>`;

// Local metres → RD New → WGS84 (Schreutelkamp and Strang van Hees approximation, ~1 m).
function toLatLon(x, z) {
  const dX = (x + config.origin[0] - 155000) * 1e-5, dY = (config.origin[1] - z - 463000) * 1e-5;
  const lat = 52.15517440 + (3235.65389 * dY - 32.58297 * dX ** 2 - 0.2475 * dY ** 2 - 0.84978 * dX ** 2 * dY
    - 0.0655 * dY ** 3 - 0.01709 * dX ** 2 * dY ** 2 - 0.00738 * dX + 0.0053 * dX ** 4 - 0.00039 * dX ** 2 * dY ** 3
    + 0.00033 * dX ** 4 * dY - 0.00012 * dX * dY) / 3600;
  const lon = 5.38720621 + (5260.52916 * dX + 105.94684 * dX * dY + 2.45656 * dX * dY ** 2 - 0.81885 * dX ** 3
    + 0.05594 * dX * dY ** 3 - 0.05607 * dX ** 3 * dY + 0.01199 * dY - 0.00256 * dX ** 3 * dY ** 2
    + 0.00128 * dX * dY ** 4 + 0.00022 * dY ** 2 - 0.00022 * dX ** 2 + 0.00026 * dX ** 5) / 3600;
  return [lat, lon];
}
// The article in the reader's language when there is one.
const wikiOf = w => (LANG === 'nl' && w?.wiki_nl?.extract ? w.wiki_nl : w?.wiki) || w?.wiki_nl;

function groupColor(g) {
  return GROUP_COLORS[g.layer.groups.findIndex(x => x.bit === g.bit)] || GROUP_COLORS[0];
}

function residentsHtml(b, pinned) {
  const n = residentsLayer?.notes?.[b.bag];
  if (!n) return '';
  const people = pinned ? n.people : n.people.slice(0, 3);
  return `<section><h4>${t('Lived or worked here')}</h4><ul class="residents">${people.map(p => `<li>
    <b>${pinned ? link(p.url, p.person) : esc(p.person)}</b>${p.born ? ` <span>${esc(p.born)}${p.died ? '–' + esc(p.died) : ''}</span>` : ''}
    ${p.desc ? `<div class="desc">${esc(p.desc)}</div>` : ''}
    ${pinned ? (p.quote.startsWith('Wikidata') ? `<p class="why">${esc(t(p.quote))}</p>` : `<blockquote lang="nl">${esc(p.quote)}</blockquote>`) : ''}
    ${p.died && b.year > +p.died + 5 ? `<p class="why">${LANG === 'nl' ? `Dit gebouw dateert uit ${b.year}, na de dood van ${esc(p.person.split(' ').slice(-1)[0])}; het staat op de plek van het huis.` : `This building dates from ${b.year}, after ${esc(p.person.split(' ').slice(-1)[0])} died; it stands where their house stood.`}</p>` : ''}</li>`).join('')}</ul>
    ${!pinned && n.people.length > 3 ? `<p class="why">${LANG === 'nl' ? 'en' : 'and'} ${n.people.length - 3} ${LANG === 'nl' ? 'meer' : 'more'}</p>` : ''}</section>`;
}

// ---------- Photos through the years ----------
// A card shows a building's photos as slides, today's last; for now that is the one from Wikimedia Commons.
// ---------- The card's head ----------
// The head is painted in the building's period colour, so the card says its age before it is read: name, address,
// year. Text goes dark on the light colours of the palette and white on the dark ones.
const addrShards = {};
function addressOf(gid, then) {
  const k = Math.floor(gid / 4096);
  if (addrShards[k] === undefined) {
    addrShards[k] = null;
    fetch(`${D}addr/${k}.json`).then(r => r.json()).then(d => { addrShards[k] = d; then(); }).catch(() => {});
  }
  return addrShards[k]?.[gid % 4096] || null;
}
// The register's entry per monument (pipeline/s16_register.py): text, complex, photos from the RCE image bank.
const regShards = {};
function registerOf(nr, then) {
  const k = nr % 16;
  if (regShards[k] === undefined) {
    regShards[k] = null;
    fetch(`${D}register/${k}.json`).then(r => r.json()).then(d => { regShards[k] = d; then(); }).catch(() => {});
  }
  return regShards[k]?.[nr] || null;
}
const RIGHTS = [[/publicdomain\/zero/, 'CC0'], [/by-sa\/4\.0/, 'CC BY-SA 4.0'], [/by\/4\.0/, 'CC BY 4.0'], [/by-sa/, 'CC BY-SA'], [/\/by\//, 'CC BY']];
const rightsOf = url => (RIGHTS.find(([re]) => re.test(url || '')) || [0, t('rights reserved')])[1];
function inkOn(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.3 ? '#000' : '#fff';
}
// Google Maps by address, so Google opens its own card for the place; by coordinates when there is no address.
function googleMapsUrl(b, a) {
  const [lat, lon] = toLatLon(b.x, b.z);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a ? `${a[0]}, ${config.label}` : `${lat.toFixed(6)},${lon.toFixed(6)}`)}`;
}
function cardHeadHtml(b, w, period) {
  const a = addressOf(b.gid, () => refreshCard(b.gid));
  const address = a && `${esc(a[0])}${a[1] ? ` <span class="more">${LANG === 'nl' ? `(en ${a[1]} meer)` : `(and ${a[1]} more)`}</span>` : ''}`;
  const name = w?.label && tr(w, 'label');
  // a Wikidata label that is only the address (many listed houses) is said once
  const sameAsAddress = name && a && name.replace(/,.*$/, '') === a[0];
  return `<header class="card-head" style="background:${period.color};color:${inkOn(period.color)}">
      ${name && !sameAsAddress ? `<h3>${esc(name)}</h3>` : ''}
      <p class="addr">${address ? `<span>${address}</span>` : ''}<a class="gmaps" href="${esc(googleMapsUrl(b, a))}" target="_blank" rel="noopener" title="${t('Open in Google Maps')}" aria-label="${t('Open in Google Maps')}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.6 5-8.6A5 5 0 0 0 3 6.4C3 10.4 8 15 8 15z"/><circle cx="8" cy="6.4" r="1.8"/></svg></a></p>
      <div class="when"><span class="y">${[1, 2, 4].includes(b.flag) ? 'c. ' : ''}${b.year}</span>
        <span class="period">${esc(t(period.label))}</span></div>
    </header>`;
}

let slides = [], slide = 0;
function photosHtml(b, im, credit, pinned, reg) {
  // the register's photos (RCE image bank) first, today's photo from Wikimedia last; the card opens on today
  const rce = (reg?.photos || []).map((p, i) => ({
    src: p.src, label: `RCE ${i + 1}`, page: p.page,
    credit: `${p.desc ? esc(p.desc) + ', ' : ''}${pinned && p.page ? link(p.page, t('RCE image bank')) : t('RCE image bank')}, ${esc(rightsOf(p.rights))}`,
  }));
  slides = [...rce, ...(im ? [{ src: im.thumb, label: t('Today'), credit: `${t('Photo')}: ${credit}` }] : [])];
  if (!slides.length) return '';
  slide = im ? slides.length - 1 : 0;
  const s = slides[slide], more = '';
  return `<figure class="photo${s.sv ? ' sv' : ''}"><div class="frame">${s.sv ? `<img data-sv="${esc(s.sv)}" alt="">` : `<img src="${esc(s.src)}" alt="">`}
    ${pinned && slides.length > 1 ? `<button class="prev" aria-label="${t('Earlier')}">‹</button><button class="next" aria-label="${t('Later')}">›</button>` : ''}
    ${slides.length > 1 ? `<span class="year">${s.label}</span>` : ''}</div>
    <figcaption>${s.credit}</figcaption>${pinned && slides.length > 1 ? '<nav class="years"></nav>' : ''}${more}</figure>`;
}
function showSlide(i) {
  const fig = card.querySelector('.photo');
  if (!fig || !slides.length) return;
  slide = Math.max(0, Math.min(i, slides.length - 1));
  const s = slides[slide], img = fig.querySelector('img');
  img.removeAttribute('data-sv');
  img.src = s.sv || s.src;
  fig.classList.toggle('sv', !!s.sv);
  const year = fig.querySelector('.year');
  if (year) year.textContent = s.label;
  fig.querySelector('figcaption').innerHTML = s.credit;
  const nav = fig.querySelector('.years');
  if (nav) {
    nav.innerHTML = slides.map((x, k) => `<button data-slide="${k}"${k === slide ? ' aria-current="true"' : ''}>${x.label}</button>`).join('');
    nav.querySelectorAll('button').forEach(b => b.addEventListener('click', () => showSlide(+b.dataset.slide)));
  }
  fig.querySelector('.prev')?.toggleAttribute('disabled', slide === 0);
  fig.querySelector('.next')?.toggleAttribute('disabled', slide === slides.length - 1);
}
function wireSlides() {
  const fig = card.querySelector('.photo');
  if (!fig) return;
  // A picture that fails to load says so and links to the archive; with nothing else to show the frame goes.
  fig.querySelector('img').addEventListener('error', () => {
    if (slides.length < 2) { fig.remove(); return; }
    fig.classList.add('failed');
    fig.querySelector('.frame .gone')?.remove();
    fig.querySelector('.frame').insertAdjacentHTML('afterbegin', `<p class="gone">${t('This photo did not load.')}${
      slides[slide].page ? ` ${link(slides[slide].page, t('Open it in the archive'))}` : ''}</p>`);
  });
  fig.querySelector('img').addEventListener('load', () => { fig.classList.remove('failed'); fig.querySelector('.frame .gone')?.remove(); });
  fig.querySelector('.prev')?.addEventListener('click', () => showSlide(slide - 1));
  fig.querySelector('.next')?.addEventListener('click', () => showSlide(slide + 1));
  let x0 = null; // swipe on phones
  fig.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  fig.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) showSlide(slide + (dx < 0 ? 1 : -1)); });
  if (fig.querySelector('.years')) showSlide(slide);
}
// A shard that arrives after the card is drawn redraws the card, if it still shows that building.
function refreshCard(gid) {
  if (card.hidden) return;
  if (pinnedGid === gid) pinCard(gid, ...lastPin);
  else if (hoverGid === gid) { hoverGid = -1; showCard(gid, ...(pointer || lastPin)); }
}

// The card reads top to bottom: photo, name and year; what the building is; the layers it belongs to and why;
// the facts; how its date was found; where to read more.
function cardHtml(gid, pinned) {
  const b = building(gid);
  const w = b.wk >= 0 ? wiki[b.wk] : null;
  const im = w?.image?.thumb ? w.image : null;
  const period = periodOf(b.year);
  const reg = b.mon ? registerOf(b.mon, () => refreshCard(gid)) : null;
  // The monument register is where a reader goes; the same monument in the RCE's Linked Data Voorziening is shown
  // by its own URI, named as such, for whoever works with the data.
  const choId = reg?.cho?.split('/').pop();
  const ldvLink = reg?.cho && link(reg.cho, `${t('Linked Data Voorziening')} (CHO ${choId})`);
  const facts = [
    [t('Height'), `${b.height.toFixed(1)} m`],
    [t('Storeys'), b.fsrc === 0 ? t('from the 3D BAG model') : t('height ÷ 3.2 m')],
    w?.architects?.length && [t(w.architects.length > 1 ? 'Architects' : 'Architect'), w.architects.map(esc).join(', ')],
    w?.styles?.length && [t('Style'), w.styles.map(esc).join(', ')],
    b.mon && [t('National monument'), pinned ? link(`https://monumentenregister.cultureelerfgoed.nl/monumenten/${b.mon}`, `${LANG === 'nl' ? 'nr.' : 'no.'} ${b.mon}`)
      : `${LANG === 'nl' ? 'nr.' : 'no.'} ${b.mon}`],
    reg?.cho && [t('Linked Data Voorziening'), pinned ? link(reg.cho, `CHO ${choId}`) : `CHO ${choId}`],
    b.energy && [t('Energy label'), `<span class="elabel" style="background:${ENERGY_COLORS[b.energy]}">${config.energy.labels[b.energy - 1]}</span>`],
  ].filter(Boolean);
  const credit = im && (pinned
    ? `${link(im.page || im.thumb, im.artist || 'Wikimedia Commons')}${im.license ? `, ${im.licenseUrl ? link(im.licenseUrl, im.license) : esc(im.license)}` : ''}`
    : `${esc(im.artist || 'Wikimedia Commons')}${im.license ? `, ${esc(im.license)}` : ''}`);
  const sources = [
    wikiOf(w)?.url && link(wikiOf(w).url, t(wikiOf(w).lang === 'nl' ? 'Dutch Wikipedia' : 'Wikipedia')),
    b.mon && link(`https://monumentenregister.cultureelerfgoed.nl/monumenten/${b.mon}`, t('Monument register')),
    THEME?.credit && b.mon && link(THEME.credit.search + encodeURIComponent([reg?.name || w?.label_nl || w?.label, reg?.place].filter(Boolean).join(' ')), 'Allemolens.nl'),
    ldvLink,
    link(`https://bagviewer.kadaster.nl/lvbag/bag-viewer/?objectId=${b.bag}`, t('BAG register')),
    link(googleMapsUrl(b, addressOf(b.gid, () => {})), 'Google Maps'),
  ].filter(Boolean);
  const inLayers = b.groups.map(g => {
    const note = g.layer.notes?.[b.bag];
    return `<li><i style="background:${groupColor(g)}"></i><div><b>${esc(tr(g.layer, 'title'))}</b> <span>${esc(tr(g, 'label'))}</span>
      ${pinned && note ? `<p>${esc(tr(note, 'story'))}${note.source ? ` ${link(note.source, /linkeddata\.cultureelerfgoed/.test(note.source) ? `${t('Source')} (LDV)` : t('Source'))}` : ''}</p>` : ''}</div></li>`;
  }).join('');
  const regHtml = pinned && reg?.text ? `<section class="register"><h4>${t('From the register')}</h4>
      ${reg.complex ? `<p class="why">${t('Part of the complex')} ${link(reg.complex.url, reg.complex.name || '')}${
        reg.complex.cho ? ` · ${link(reg.complex.cho, `${t('Linked Data Voorziening')} (CHO ${reg.complex.cho.split('/').pop()})`)}` : ''}</p>` : ''}
      <p class="extract" lang="nl">${esc(reg.text)}</p>
      <p class="reg-main">${link(reg.url, `${t('View in the Rijksmonumentenregister')} (${LANG === 'nl' ? 'nr.' : 'no.'} ${b.mon})`)}</p>
      ${THEME?.credit ? `<p>${link(THEME.credit.search + encodeURIComponent([reg.name || w?.label_nl || w?.label, reg.place].filter(Boolean).join(' ')),
        t('More about this mill on Allemolens.nl'))} <span class="why">(${esc(THEME.credit.label)}, ${t('with thanks')})</span></p>` : ''}
      ${reg.cho ? `<p class="ldv">${t('In the Linked Data Voorziening')}: ${link(reg.cho, reg.cho)}</p>` : ''}</section>` : '';
  const dating = b.orig !== b.year ? `${t(DATE_NOTE[b.flag] || '')} ${t('BAG gives')} ${b.orig}.` : (DATE_NOTE[b.flag] && t(DATE_NOTE[b.flag]));
  return `
    ${pinned ? '<button class="card-close" aria-label="Close">×</button>' : ''}
    ${photosHtml(b, im, credit, pinned, reg)}
    ${cardHeadHtml(b, w, period)}
    ${pinned && wikiOf(w)?.extract ? `<section><p class="extract">${esc(wikiOf(w).extract)}</p></section>` : ''}
    ${regHtml}
    ${didYouKnow[b.bag] ? `<section class="fact"><h4>${t('Did you know')}</h4><p>${esc(LANG === 'nl' ? didYouKnow[b.bag].nl : didYouKnow[b.bag].en)}${pinned ? ` ${link(didYouKnow[b.bag].source, t('Source'))}` : ''}</p></section>` : ''}
    ${residentsHtml(b, pinned)}
    ${inLayers ? `<section><h4>${t('In layers')}</h4><ul class="chips">${inLayers}</ul></section>` : ''}
    <section><dl>${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>
    ${dating ? `<section><h4>${t('Dating')}</h4><p class="why">${dating}</p></section>` : ''}
    ${pinned ? `<section class="sources"><h4>${t('Read more')}</h4><p>${sources.join(', ')}</p></section>`
      : `<p class="hint">${w?.wiki || b.groups.some(g => g.layer.notes?.[b.bag]) ? t('Click for the story and sources') : t('Click to keep this card open')}</p>`}`;
}

const card = document.getElementById('card');
let pinnedGid = -1;
let svTimer = null;
function loadStreetViews(delay) {
  clearTimeout(svTimer);
  svTimer = setTimeout(() => card.querySelectorAll('img[data-sv]').forEach(img => {
    img.addEventListener('load', () => placeCard(...(pointer || lastPin)), { once: true });
    img.src = img.dataset.sv;
  }), delay);
}
let lastPin = [0, 0];
function placeCard(x, y) {
  const r = card.getBoundingClientRect();
  card.style.left = Math.max(12, Math.min(x + 18, innerWidth - r.width - 12)) + 'px';
  card.style.top = Math.max(12, Math.min(y + 18, innerHeight - r.height - 12)) + 'px';
}
let hoverGid = -1;
function showCard(gid, x, y) {
  if (pinnedGid >= 0 || phone.matches) return;
  if (gid < 0) { card.hidden = true; hoverGid = -1; return; }
  if (gid !== hoverGid || card.hidden) {
    // Re-render only when the building changes, so the photo is not reloaded every frame.
    hoverGid = gid;
    card.innerHTML = cardHtml(gid, false);
    wireSlides();
    card.classList.remove('pinned');
    card.hidden = false;
    loadStreetViews(350);
    card.querySelector('img')?.addEventListener('load', () => placeCard(...(pointer || [x, y])));
  }
  placeCard(x, y);
}
function pinCard(gid, x, y) {
  pinnedGid = gid;
  hoverGid = -1;
  uniforms.uSelected.value = gid;
  if (gid < 0) { card.hidden = true; card.classList.remove('pinned'); return; }
  card.innerHTML = cardHtml(gid, true);
  wireSlides();
  card.classList.add('pinned');
  lastPin = [x, y];
  collapsePanelOnPhone();
  loadStreetViews(0);
  card.hidden = false;
  card.querySelector('.card-close').onclick = () => pinCard(-1);
  card.querySelector('img')?.addEventListener('load', () => placeCard(x, y));
  placeCard(x, y);
}
addEventListener('keydown', e => { if (e.key === 'Escape') pinCard(-1); });

// A click (not a drag) pins the building under the pointer, or clears the pin on empty ground.
let pointer = null, dragging = false, downAt = null;
canvas.addEventListener('pointermove', e => { pointer = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerdown', e => {
  dragging = true; downAt = [e.clientX, e.clientY];
  if (pinnedGid < 0 && !ARCH.on) card.hidden = true;
});
canvas.addEventListener('pointerup', e => {
  dragging = false;
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  if (pickingStart) {
    const at = groundAt(e.clientX, e.clientY);
    if (at) { pickingStart = false; walkPrefs.at = at; walkPrefs.atLabel = t('Point on the map'); walkEl.hidden = true; openWalks(); }
    return;
  }
  if (ARCH.on) { archClick(e.clientX, e.clientY); return; }
  const mk = markerAt(e.clientX, e.clientY);
  if (mk) { card.hidden = true; flyTo(mk[0], mk[1], () => pinCard(mk[2], innerWidth * 0.62, innerHeight * 0.22), 420); return; }
  const gid = pick(e.clientX, e.clientY);
  pinCard(gid === pinnedGid ? -1 : gid, e.clientX, e.clientY);
});
canvas.addEventListener('pointerleave', () => { pointer = null; if (pinnedGid < 0 && !ARCH.on) card.hidden = true; uniforms.uHover.value = -1; });

// ---------- Flying to a building ----------
let bagIndex = null;
function gidOf(bag) {
  if (!bagIndex) {
    bagIndex = new Map();
    for (let g = 0; g < config.stats.buildings; g++) {
      bagIndex.set(String(attrs.getFloat64(g * config.attrStride, true)).padStart(16, '0'), g);
    }
  }
  return bagIndex.get(bag) ?? -1;
}
let flight = null;
function flyTo(x, z, done, distance = 520) {
  const dir = camera.position.clone().sub(controls.target).normalize();
  const side = ARCH.on ? -1 : 1;
  if (dir.y * side < 0.45) { dir.y = 0.45 * side; dir.normalize(); }
  const target = new THREE.Vector3(x, ARCH.on ? ARCH_CENTRE : 0, z);
  flight = { t0: performance.now(), dur: 1400, fromT: controls.target.clone(), toT: target,
    fromP: camera.position.clone(), toP: target.clone().add(dir.multiplyScalar(distance)), done };
}
function stepFlight(now) {
  if (!flight) return;
  const k = Math.min(1, (now - flight.t0) / flight.dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  controls.target.lerpVectors(flight.fromT, flight.toT, e);
  camera.position.lerpVectors(flight.fromP, flight.toP, e);
  if (k >= 1) { const d = flight.done; flight = null; d?.(); }
}

// Zoom buttons, for those without a scroll wheel: in, out, and back to the overview the map opened on.
function zoomBy(f) {
  const off = camera.position.clone().sub(controls.target);
  off.setLength(THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance));
  flight = { t0: performance.now(), dur: 450, fromT: controls.target.clone(), toT: controls.target.clone(),
    fromP: camera.position.clone(), toP: controls.target.clone().add(off) };
}
document.querySelector('.zoom-in').onclick = () => zoomBy(0.5);
document.querySelector('.zoom-out').onclick = () => zoomBy(2);
document.querySelector('.zoom-home').onclick = () => {
  let [t, p] = homeView();
  if (ARCH.on) {  // under the ground: the same overview, seen from below as it is now
    t = new THREE.Vector3(t.x, ARCH_CENTRE, t.z);
    p = t.clone().add(camera.position.clone().sub(controls.target).setLength(config.home.span * 0.9));
  }
  flight = { t0: performance.now(), dur: 1400, fromT: controls.target.clone(), toT: t, fromP: camera.position.clone(), toP: p };
};

// A text in the reader's language: {en, nl} objects as the walks carry them.
const L10 = o => o?.[LANG] || o?.en || '';
// Storeys and energy labels are views of the buildings themselves; they live in the layers list.
function setBuildingView(m) {
  document.querySelectorAll('.modes button[data-mode]').forEach(x => x.setAttribute('aria-pressed', x.dataset.mode === String(MODE.layers)));
  activeLayer = null;
  uniforms.uGroupBit.value = Array(MAX_GROUPS).fill(-1);
  uniforms.uMode.value = m;
  if (!phone.matches) setCollapsed(false);
  renderPanel(); drawHist();
}
// Walk shows as on while a walk is open; on a phone the timeline steps aside.
function markWalk() {
  document.querySelector('.walks-open').setAttribute('aria-pressed', String(!!walkRoute));
  document.body.classList.toggle('walking', !!walkRoute);
}

// ---------- Walks ----------
// Where a walk can start besides the walker's location: the city config's list, else the map's centre.
const STARTS = config.starts || [{ en: 'Centre', nl: 'Centrum', x: 0, z: 0 }];
// A walk through the stories the walker cares about: pick interests, a start and a distance; the stops are the
// buildings with a story in those layers, chosen greedily by story per metre and ordered by 2-opt. Distances are
// straight lines times a detour factor; Google Maps gives the real walking route.
const DETOUR = 1.3, WALK_KMH = 4.5, STOP_MIN = 3, MAX_STOPS = 20;
const GOOGLE_LEG = 9;  // a Google Maps link takes at most 9 waypoints
const walkEl = document.getElementById('walk');
const walksDlg = document.getElementById('walks');
const walkGroup = new THREE.Group();
walkGroup.renderOrder = 5;
scene.add(walkGroup);
let walkPrefs = { layers: [], start: 0, km: 3, loop: true, at: null, stops: 0 }, walkRoute = null, pickingStart = false;

// WGS84 → local metres (inverse of toLatLon, Schreutelkamp and Strang van Hees, ~1 m).
function fromLatLon(lat, lon) {
  const p = 0.36 * (lat - 52.15517440), l = 0.36 * (lon - 5.38720621);
  const X = 155000 + 190094.945 * l - 11832.228 * p * l - 114.221 * p * p * l - 32.391 * l ** 3 - 0.705 * p
    - 2.34 * p ** 3 * l - 0.608 * p * l ** 3 - 0.008 * l * l + 0.148 * p * p * l ** 3;
  const Y = 463000 + 309056.544 * p + 3638.893 * l * l + 73.077 * p * p - 157.984 * p * l * l + 59.788 * p ** 3
    + 0.433 * l - 6.439 * p * p * l * l - 0.032 * p * l + 0.092 * l ** 4 - 0.054 * p * l ** 4;
  return [X - config.origin[0], -(Y - config.origin[1])];
}
// Every building with a story, merged across layers: one stop can carry several stories.
let poiCache = null;
function pois() {
  if (poiCache) return poiCache;
  const by = new Map();
  for (const L of layers) for (const [bag, n] of Object.entries(L.notes || {})) {
    if (!n.at) continue;
    const p = by.get(bag) || { bag, bags: [bag], x: n.at[0], z: n.at[1], notes: [] };
    p.notes.push({ L, n });
    by.set(bag, p);
  }
  // One stop per named place: a complex of several buildings (a laboratory, a hofje) carries the same story on
  // each of them; keep the building nearest their middle.
  const byName = new Map();
  for (const p of by.values()) {
    const key = p.notes.map(x => x.n.name).find(Boolean) || p.bag;
    (byName.get(key) || byName.set(key, []).get(key)).push(p);
  }
  poiCache = [];
  for (const ps of byName.values()) {
    const mx = ps.reduce((a, p) => a + p.x, 0) / ps.length, mz = ps.reduce((a, p) => a + p.z, 0) / ps.length;
    const keep = ps.reduce((a, p) => Math.hypot(p.x - mx, p.z - mz) < Math.hypot(a.x - mx, a.z - mz) ? p : a);
    const seen = new Set(keep.notes.map(x => x.L.id));
    keep.bags = [...new Set(ps.flatMap(p => p.bags))];
    for (const p of ps) for (const x of p.notes) if (!seen.has(x.L.id)) { keep.notes.push(x); seen.add(x.L.id); }
    poiCache.push(keep);
  }
  return poiCache;
}
const walkLayers = () => layers.filter(L => Object.values(L.notes || {}).filter(n => n.at).length >= 3);
const poiName = p => { if (p.name) return p.name; const n = p.notes.find(x => x.n.name && !x.n.people) || p.notes[0]; return tr(n.n, 'name') || n.n.name; };
function poiScore(p, chosen) {
  const hit = p.notes.filter(x => !chosen.length || chosen.includes(x.L.id)).length;
  if (!hit) return 0;
  const g = gidOf(p.bag), w = g >= 0 ? wiki[building(g).wk] : null;
  return 1 + 0.5 * (hit - 1) + (w?.image ? 0.4 : 0) + (didYouKnow[p.bag] ? 0.3 : 0);
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function pathLen(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += dist(pts[i - 1], pts[i]); return d; }
function planWalkWithGap({ layers: chosen, km, loop, stops: asked, custom }, start, gap) {
  const budget = km * 1000 / DETOUR;
  const S = { x: start[0], z: start[1], start: true };
  let cand = (custom || pois().map(p => ({ ...p, score: poiScore(p, chosen) })))
    .filter(p => p.score > 0 && dist(p, S) <= (loop ? budget / 2 : budget));
  // Stops keep a spacing that grows with the walk, so a long walk goes somewhere instead of circling the Markt;
  // a closer one merges into the higher scored stop (a church with three entries is one stop).
  cand.sort((a, b) => b.score - a.score);
  cand = cand.filter((p, i) => !cand.slice(0, i).some(q => dist(p, q) < 25));
  const route = loop ? [S, S] : [S];
  const cap = asked || MAX_STOPS;
  const max = loop ? cap : cap + 1;
  while (route.length - (loop ? 2 : 1) < max) {
    let best = null;
    for (const c of cand) {
      if (route.includes(c) || route.some(r => !r.start && dist(r, c) < gap)) continue;
      for (let i = 0; i < route.length; i++) {
        const next = route[i + 1];
        const add = next ? dist(route[i], c) + dist(c, next) - dist(route[i], next) : dist(route[i], c);
        if (!next && loop) continue;
        if (pathLen(route) + add > budget) continue;
        const ratio = c.score / (add + gap);
        if (!best || ratio > best.ratio) best = { c, i, ratio };
      }
    }
    if (!best) break;
    route.splice(best.i + 1, 0, best.c);
  }
  // 2-opt over the stops between the fixed ends
  for (let improved = true; improved;) {
    improved = false;
    const last = loop ? route.length - 2 : route.length - 1;
    for (let i = 1; i < last; i++) for (let j = i + 1; j <= last; j++) {
      const a = route[i - 1], b = route[i], c = route[j], d = route[j + 1];
      const before = dist(a, b) + (d ? dist(c, d) : 0), after = dist(a, c) + (d ? dist(b, d) : 0);
      if (after < before - 1) { route.splice(i, j - i + 1, ...route.slice(i, j + 1).reverse()); improved = true; }
    }
  }
  return { start: S, stops: route.filter(p => !p.start), loop, length: pathLen(route) * DETOUR, route,
    score: route.reduce((n, p) => n + (p.score || 0), 0) };
}
// A wide spacing first; when the chosen stories are few and close together, tighter spacings keep them all.
function planAtLength(prefs, start) {
  const wide = Math.min(400, Math.max(30, prefs.km * 1000 / DETOUR / ((prefs.stops || MAX_STOPS) * 2.2)));
  const plans = [wide, wide / 2, wide / 4, 25].map(g => planWalkWithGap(prefs, start, g));
  const most = Math.max(...plans.map(p => p.stops.length));
  return plans.find(p => p.stops.length >= most);  // the widest spacing that loses no stop
}
// A walk with one or two stops is not a walk: when the chosen stories lie further away than the distance allows,
// the distance grows (up to three times) until there are a few of them, and the card says so.
const MIN_STOPS = 4;
function planWalk(prefs, start) {
  const available = prefs.custom ? prefs.custom.length : pois().filter(p => poiScore(p, prefs.layers) > 0).length;
  const want = Math.min(prefs.stops || MIN_STOPS, available);
  let w = planAtLength(prefs, start);
  for (let k = 1.25; w.stops.length < want && k <= 4.01; k += 0.25) {
    w = planAtLength({ ...prefs, km: prefs.km * k }, start);
    w.stretched = true;
  }
  return w;
}
// A stop goes to Google Maps by name and address, so Google opens its own card for the place (often with the
// Wikipedia summary); a stop without an address, and the start, go by coordinates.
const poiAddress = p => p.notes.map(x => x.n.address || x.n.people?.find(q => q.address)?.address).find(Boolean);
function poiQuery(p) {
  const addr = poiAddress(p), name = poiName(p);
  if (!addr) return null;
  return [name && name !== addr ? name : null, addr, config.label].filter(Boolean).join(', ');
}
// One Google Maps link: it takes at most 9 waypoints, so a longer walk sends the 9 best stops in walking order;
// the others lie on the way between them.
function googleStops(w) {
  const max = w.loop ? GOOGLE_LEG : GOOGLE_LEG + 1;
  if (w.stops.length <= max) return w.stops;
  const keep = new Set([...w.stops].sort((a, b) => b.score - a.score).slice(0, max));
  return w.stops.filter(p => keep.has(p));
}
function googleUrl(w) {
  const ll = p => (!p.start && poiQuery(p)) || toLatLon(p.x, p.z).map(v => v.toFixed(6)).join(',');
  const stops = googleStops(w).map(ll);
  const dest = w.loop ? ll(w.start) : stops.pop();
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  u.searchParams.set('origin', ll(w.start));
  u.searchParams.set('destination', dest);
  if (stops.length) u.searchParams.set('waypoints', stops.join('|'));
  u.searchParams.set('travelmode', 'walking');
  return u.toString();
}
// The walk as KML, for Google My Maps or any map app: every stop with its story, its sources and a photo.
function walkKml(w) {
  const x = v => String(v ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const pt = p => toLatLon(p.x, p.z).reverse().join(',') + ',0';
  const marks = w.stops.map((p, i) => {
    const g = gidOf(p.bag), wk = g >= 0 ? wiki[building(g).wk] : null, img = wk?.image?.thumb;
    const art = wk && (LANG === 'nl' ? wk.wiki_nl || wk.wiki : wk.wiki || wk.wiki_nl);
    const stories = p.notes.map(n => n.n.people
      ? `<p>${n.n.people.map(q => `${x(q.person)} (<a href="${x(q.url)}">Wikipedia</a>)`).join(', ')}</p>`
      : `<p>${x(tr(n.n, 'story'))}${n.n.source ? ` <a href="${x(n.n.source)}">${x(t('Source'))}</a>` : ''}</p>`).join('');
    const desc = `${img ? `<img src="${x(img)}" width="300"/>` : ''}${stories}${art?.url ? `<p><a href="${x(art.url)}">Wikipedia</a></p>` : ''}`;
    return `<Placemark><name>${i + 1}. ${x(poiName(p))}</name><description><![CDATA[${desc}]]></description>
<Point><coordinates>${pt(p)}</coordinates></Point></Placemark>`;
  }).join('\n');
  const line = [w.start, ...w.stops, ...(w.loop ? [w.start] : [])].map(pt).join(' ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>LAYRS ${x(config.label)}: ${x(t('Your walk'))}</name>
<Placemark><name>${x(t('Start'))}</name><Point><coordinates>${pt(w.start)}</coordinates></Point></Placemark>
${marks}
<Placemark><name>${x(t('Your walk'))}</name><LineString><tessellate>1</tessellate><coordinates>${line}</coordinates></LineString></Placemark>
</Document></kml>`;
}
function downloadKml(w) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([walkKml(w)], { type: 'application/vnd.google-earth.kml+xml' }));
  a.download = `layrs-${config.city}-walk.kml`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// ---- on the map: a ribbon along the walk and a numbered disc over every stop
function discTexture(text, fill, ink) {
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(48, 48, 40, 0, Math.PI * 2); g.fillStyle = fill; g.fill();
  g.lineWidth = 7; g.strokeStyle = '#ffffff'; g.stroke();
  g.fillStyle = ink; g.font = '800 44px "Schibsted Grotesk", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 48, 51);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
}
// While a walk is shown the city is a plain model and only the walk's buildings carry colour (the graph's focus).
function lightWalk(w) {
  if (!w) { uniforms.uFocusN.value = 0; return; }
  const gids = [...new Set(w.stops.flatMap(p => p.bags.map(gidOf)))].filter(g => g >= 0);
  setFocus(gids, gids.map(() => 0));
}
function drawWalk(w) {
  walkGroup.clear();
  lightWalk(w);
  if (!w) return;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || css.getPropertyValue('--red').trim() || '#1f3f9a';
  const pts = w.route, pos = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = dist(a, b) || 1, nx = -(b.z - a.z) / len * 3.5, nz = (b.x - a.x) / len * 3.5;
    pos.push(a.x + nx, 1, a.z + nz, a.x - nx, 1, a.z - nz, b.x + nx, 1, b.z + nz,
      a.x - nx, 1, a.z - nz, b.x - nx, 1, b.z - nz, b.x + nx, 1, b.z + nz);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const ribbon = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  walkGroup.add(ribbon);
  const marker = (p, text, fill, ink) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTexture(text, fill, ink), depthTest: false, sizeAttenuation: false }));
    s.scale.set(0.034, 0.034, 1);
    s.position.set(p.x, 30, p.z);
    s.renderOrder = 20;
    walkGroup.add(s);
  };
  marker(w.start, '★', '#ffffff', accent);
  w.stops.forEach((p, i) => marker(p, String(i + 1), accent, '#ffffff'));
}
// ---- the planner
function startPoint() {
  if (walkPrefs.at) return walkPrefs.at;
  const s = STARTS[walkPrefs.start] || STARTS[0];
  return [s.x, s.z];
}
function renderWalkPlanner(msg = '') {
  const L = walkLayers(), sel = walkPrefs.layers;
  const startName = walkPrefs.at ? (walkPrefs.atLabel || t('Your point')) : L10(STARTS[walkPrefs.start]);
  document.getElementById('walks-body').innerHTML = `
    <h2 id="walks-title">${t('Plan a walk')}</h2>
    <p class="w-lede">${t('Choose what interests you, where you start and how far you want to go. The walk links the buildings with stories on the way.')}</p>
    <h3>${t('Where you start')}</h3>
    <div class="w-locate">${walkPrefs.atLabel === t('Your location')
      ? `<p class="w-note">${t('Start')}: ${esc(startName)}</p>`
      : `<button class="w-share" data-geo>${t(locating ? 'Asking for your location…' : 'Share my location')}</button>
         <p class="w-note">${t('Start from where you are: share your location, or choose a start below.')}</p>`}</div>
    <div class="w-chips">${STARTS.map((s, i) => `<button class="w-chip" data-start="${i}" aria-pressed="${!walkPrefs.at && walkPrefs.start === i}">${esc(L10(s))}</button>`).join('')}
      <button class="w-chip" data-pick aria-pressed="${walkPrefs.atLabel === t('Point on the map')}">${t('Pick on the map')}</button></div>
    ${walkPrefs.atLabel === t('Your location') ? '' : `<p class="w-note">${t('Start')}: ${esc(startName)}</p>`}
    <h3>${t('What interests you')}</h3>
    <div class="w-chips">${L.map(l => `<button class="w-chip" data-l="${l.id}" aria-pressed="${sel.includes(l.id)}">${sectionIcon(l.section)}${esc(tr(l, 'title'))}</button>`).join('')}</div>
    <p class="w-note">${sel.length ? '' : t('Nothing chosen: the walk takes every story.')}</p>
    <h3>${t('How far')}</h3>
    <div class="w-chips">${[1, 2, 3, 5, 8].map(k => `<button class="w-chip" data-km="${k}" aria-pressed="${walkPrefs.km === k}">${k} km</button>`).join('')}
      <span class="w-sep"></span>
      <button class="w-chip" data-loop="1" aria-pressed="${walkPrefs.loop}">${t('Back to the start')}</button>
      <button class="w-chip" data-loop="0" aria-pressed="${!walkPrefs.loop}">${t('One way')}</button></div>
    <h3>${t('How many stops')}</h3>
    <div class="w-chips">${[0, 5, 10, 15, 20].map(n => `<button class="w-chip" data-stops="${n}" aria-pressed="${walkPrefs.stops === n}">${n ? n : t('As many as fit')}</button>`).join('')}</div>
    ${msg ? `<p class="w-msg">${esc(msg)}</p>` : ''}
    <div class="w-go"><button class="w-make">${t('Make my walk')}</button></div>`;
  const body = document.getElementById('walks-body');
  body.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
    const id = b.dataset.l;
    walkPrefs.layers = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
    renderWalkPlanner();
  });
  body.querySelectorAll('[data-start]').forEach(b => b.onclick = () => { walkPrefs.start = +b.dataset.start; walkPrefs.at = null; walkPrefs.atLabel = null; renderWalkPlanner(); });
  body.querySelectorAll('[data-km]').forEach(b => b.onclick = () => { walkPrefs.km = +b.dataset.km; renderWalkPlanner(); });
  body.querySelectorAll('[data-stops]').forEach(b => b.onclick = () => { walkPrefs.stops = +b.dataset.stops; renderWalkPlanner(); });
  body.querySelectorAll('[data-loop]').forEach(b => b.onclick = () => { walkPrefs.loop = b.dataset.loop === '1'; renderWalkPlanner(); });
  body.querySelector('[data-geo]')?.addEventListener('click', requestLocation);
  body.querySelector('[data-pick]').onclick = () => { pickingStart = true; walksDlg.close(); showWalkHint(); };
  body.querySelector('.w-make').onclick = makeWalk;
}
let locating = false, locationAsked = false;
function requestLocation() {
  locationAsked = true;
  if (!navigator.geolocation) { renderWalkPlanner(t('This browser does not share its location.')); return; }
  locating = true; renderWalkPlanner();
  navigator.geolocation.getCurrentPosition(pos => {
    locating = false;
    const [x, z] = fromLatLon(pos.coords.latitude, pos.coords.longitude);
    if (Math.hypot(x, z) > 6000) { renderWalkPlanner(t('You seem to be outside the city, so the walk starts at {s}.').replace('{s}', L10(STARTS[0]))); return; }
    walkPrefs.at = [x, z]; walkPrefs.atLabel = t('Your location'); renderWalkPlanner();
  }, () => { locating = false; renderWalkPlanner(t('The location was not shared. Pick a start on the map instead.')); },
  { enableHighAccuracy: true, timeout: 10000 });
}
function showWalkHint() {
  walkEl.hidden = false;
  walkEl.className = 'walkcard';
  walkEl.innerHTML = `<header><b>${t('Plan a walk')}</b></header><p class="q-riddle">${t('Click the map where the walk should start.')}</p>
    <div class="q-actions"><button class="w-cancel">${t('Cancel')}</button></div>`;
  walkEl.querySelector('.w-cancel').onclick = () => { pickingStart = false; walkEl.hidden = true; openWalks(); };
}
// A click on the ground while picking: where the pointer ray meets the ground plane.
function groundAt(cx, cy) {
  const r = canvas.getBoundingClientRect();
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
  const hit = new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? [hit.x, hit.z] : null;
}
function makeWalk() {
  const w = planWalk(walkPrefs, startPoint());
  if (!w.stops.length) { renderWalkPlanner(t('No stories within reach. Try a longer walk or more interests.')); return; }
  walkRoute = w;
  walksDlg.close();
  drawWalk(w);
  walkEl.hidden = true;
  renderWalk();
  // on a phone a new walk opens folded to its bar, so the route on the map is what one sees first
  if (phone.matches) walkEl.classList.add('folded');
  const xs = w.route.map(p => p.x), zs = w.route.map(p => p.z);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  flyTo((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2, null, Math.max(600, span * 2.2));
  const u = new URL(location.href);
  if (walkPrefs.custom) u.searchParams.delete('walk'); else u.searchParams.set('walk', [walkPrefs.km, walkPrefs.loop ? 1 : 0, startPoint().map(Math.round).join('_'), walkPrefs.layers.join('.'), walkPrefs.stops].join('~'));
  history.replaceState(null, '', u);
}
function renderWalk() {
  const w = walkRoute;
  if (!w) return;
  const mins = Math.round(w.length / 1000 / WALK_KMH * 60 + w.stops.length * STOP_MIN);
  const inGoogle = new Set(googleStops(w));
  const folded = !walkEl.hidden && walkEl.classList.contains('folded');
  walkEl.hidden = false;
  walkEl.className = 'walkcard' + (folded ? ' folded' : '');
  walkEl.innerHTML = `
    <button class="q-close" aria-label="${t('Close')}">×</button>
    <header><b>${t('Your walk')}</b><span class="w-meta">${(w.length / 1000).toFixed(1).replace('.', LANG === 'nl' ? ',' : '.')} km · ${t('about {m} min').replace('{m}', mins)}</span></header>
    <div class="q-actions"><a class="w-google" href="${esc(googleUrl(w))}" target="_blank" rel="noopener">${t('Open in Google Maps')}</a>
      <button class="w-change">${t('Change')}</button>
      <button class="w-kml" title="${t('Download the walk with its stories (KML), for Google My Maps: Create a new map, then Import.')}" aria-label="${t('Download the walk with its stories (KML), for Google My Maps: Create a new map, then Import.')}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0-3-3m3 3 3-3M3 12.5v1.5h10v-1.5"/></svg></button></div>
    <ol class="w-stops">${w.stops.map((p, i) => {
      const pref = [...p.notes].sort((a, b) => (walkPrefs.layers.includes(b.L.id) ? 1 : 0) - (walkPrefs.layers.includes(a.L.id) ? 1 : 0));
      const story = pref.map(x => x.n.people ? `${t('Lived or worked here')}: ${x.n.people.map(q => q.person).join(', ')}` : tr(x.n, 'story')).find(Boolean) || '';
      const off = !inGoogle.has(p);
      return `<li${off ? ' class="w-off"' : ''}><button data-i="${i}"><span class="w-num">${i + 1}</span><span><b>${esc(poiName(p))}</b><em>${esc(story)}</em></span></button></li>`;
    }).join('')}</ol>
    <p class="q-credit">${walkPrefs.stops && w.stops.length < walkPrefs.stops ? t('Fewer stops than asked: that is all the stories you chose.') + ' ' : ''}${w.stretched ? t('Longer than asked: few of the stories you chose lie that close.') + ' '
      : w.length < walkPrefs.km * 600 ? t('Shorter than asked: the stories you chose lie close together.') + ' ' : ''}${t('Straight lines on the map; Google Maps shows the walking route.')}${inGoogle.size < w.stops.length
      ? ' ' + t('Google Maps takes nine stops; the paler ones lie on the way.') : ''}</p>`;
  markWalk();
  walkEl.querySelector('.q-close').onclick = () => { walkEl.hidden = true; walkRoute = null; drawWalk(null); markWalk();
    const u = new URL(location.href); u.searchParams.delete('walk'); history.replaceState(null, '', u); };
  walkEl.querySelector('.w-change').onclick = openWalks;
  walkEl.querySelector('.w-kml').onclick = () => downloadKml(w);
  // On a phone the list folds to its title bar and the Google Maps button; a tap on the bar opens it again.
  walkEl.querySelector('header').onclick = () => walkEl.classList.toggle('folded');
  walkEl.querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
    const p = w.stops[+b.dataset.i], g = gidOf(p.bag);
    if (phone.matches) walkEl.classList.add('folded');
    flyTo(p.x, p.z, () => { if (g >= 0) pinCard(g, innerWidth / 3, innerHeight / 2); }, 330);
  });
}
// A walk straight from a layer's page or from the graph: the stories of that layer, or one stop per graph group.
function walkFromLayer(L) {
  walkPrefs = { ...walkPrefs, layers: [L.id], custom: null, stops: 0 };
  makeWalk();
}
function walkFromGroups(groups) {
  // One stop per building of the selection: a story's stop where it has one, else the building under the name of
  // its graph group (a person's several houses become several stops). Neighbours closer than 25 m merge later.
  const seen = new Set(), custom = [];
  for (const g of groups) for (const gid of g.gids) {
    const b = building(gid), own = pois().find(p => p.bags.includes(b.bag));
    const key = own ? own.bag : b.bag;
    if (seen.has(key)) continue;
    seen.add(key);
    const w = wiki[b.wk];
    custom.push(own ? { ...own, score: 1.5 + (w?.image ? 0.4 : 0) }
      : { bag: b.bag, bags: [b.bag], x: b.x, z: b.z, name: (w && tr(w, 'label')) || g.label, notes: [], score: 1 + (w?.image ? 0.4 : 0) });
  }
  walkPrefs = { ...walkPrefs, custom, stops: Math.min(MAX_STOPS, custom.length) };
  makeWalk();
}
function openWalks() {
  renderWalkPlanner();
  walksDlg.showModal();
  if (!locationAsked && !walkPrefs.at) requestLocation();  // the walk starts where the walker is, if they agree
}
document.querySelector('.walks-open').onclick = () => { walkPrefs.custom = null; openWalks(); };
walksDlg.querySelector('.about-close').onclick = () => walksDlg.close();
walksDlg.addEventListener('click', e => { if (e.target === walksDlg) walksDlg.close(); });
// A shared link restores the walk: ?walk=km~loop~x_z~layer.layer
{
  const q = new URLSearchParams(location.search).get('walk');
  if (q) {
    const [km, loop, at, ls, ns] = q.split('~');
    const [x, z] = (at || '').split('_').map(Number);
    walkPrefs = { km: +km || 3, loop: loop !== '0', start: 0, at: Number.isFinite(x) && Number.isFinite(z) ? [x, z] : null,
      atLabel: t('Point on the map'), stops: +ns || 0, layers: (ls || '').split('.').filter(id => layers.some(L => L.id === id)) };
    setTimeout(makeWalk, 0);
  }
}

// ---------- From the graph ----------
// graph.html opens the map with ./?focus=<id>,<id>: the buildings of those people, events or places light up,
// each selection in its own colour, and the rest of the city turns into a white model.
const focusEl = document.getElementById('focus');
const focusIds = (new URLSearchParams(location.search).get('focus') || '').split(',').filter(Boolean);
// ?mode=archeo opens the map turned over, under the ground; with ?focus the graph's archaeological terms light up
const startArcheo = config.archeology && new URLSearchParams(location.search).get('mode') === 'archeo';
if (startArcheo) setTimeout(() => { setArcheo(true); if (focusIds.length) showArcheoFocus(focusIds); }, 600);
else if (focusIds.length) fetch(D + 'graph.json').then(r => r.json()).then(G => showFocus(G, focusIds)).catch(() => {});
function showFocus(G, ids) {
  const groups = [];
  ids.forEach((id, i) => {
    const node = G.nodes.find(n => n.id === id), place = G.places[id];
    if (!node && !place) return;
    const bags = place ? place.bags : G.links.filter(l => l.e === id).flatMap(l => G.places[l.p].bags);
    const label = place ? place.name : (LANG === 'nl' && node.label_nl) || node.label;
    groups.push({ label, color: i % GROUP_COLORS.length, gids: [...new Set(bags)].map(gidOf).filter(g => g >= 0) });
  });
  const gids = [], grp = [];
  for (const g of groups) for (const gid of g.gids) {
    if (!gids.includes(gid)) { gids.push(gid); grp.push(g.color); }
  }
  if (!gids.length) return;
  setFocus(gids, grp);
  const pts = gids.map(building);
  const cx = pts.reduce((a, b) => a + b.x, 0) / pts.length, cz = pts.reduce((a, b) => a + b.z, 0) / pts.length;
  const spread = Math.max(...pts.map(b => Math.hypot(b.x - cx, b.z - cz)));
  flyTo(cx, cz, null, Math.min(4200, Math.max(380, spread * 2.4)));
  const cq = new URLSearchParams(location.search).get('city');
  const back = `graph.html?select=${encodeURIComponent(ids.join(','))}${cq ? `&city=${encodeURIComponent(cq)}` : ''}${LANG === 'nl' ? '&lang=nl' : ''}`;
  focusEl.innerHTML = `<header><b>${t('From the graph')}</b><button class="f-close" aria-label="${t('Close')}">×</button></header>
    <ul>${groups.map(g => `<li><i style="background:${GROUP_COLORS[g.color]}"></i><span>${esc(g.label)}</span>
      <small>${g.gids.length}</small></li>`).join('')}</ul>
    <div class="f-actions"><button class="make-walk">${t('Generate a walk')}</button><a class="f-back" href="${back}">${t('Back to the graph')}</a></div>`;
  focusEl.hidden = false;
  focusEl.querySelector('.make-walk').onclick = () => { focusEl.hidden = true; walkFromGroups(groups); };
  focusEl.querySelector('.f-close').onclick = () => {
    uniforms.uFocusN.value = 0;
    focusEl.hidden = true;
    const u = new URL(location.href); u.searchParams.delete('focus'); history.replaceState(null, '', u);
  };
}

// ---------- Deep links ----------
// ?b=<building id> opens the map on one building with its card pinned; ?layer=<layer id> opens that context layer.
// The pages written for search engines and agents (stop-token, scripts/lab-pages.mjs) link here.
function openDeepLink() {
  const u = new URLSearchParams(location.search);
  const L = u.get('layer') && layers.find(L => L.id === u.get('layer'));
  if (L) { document.querySelector(`.modes button[data-mode="${MODE.layers}"]`)?.click(); setLayer(L); }
  const g = u.get('b') ? gidOf(u.get('b')) : -1;
  if (g >= 0) { const b = building(g); flyTo(b.x, b.z, () => pinCard(g, innerWidth * 0.62, innerHeight * 0.22), 320); }
}

// ---------- Panel ----------
const panelEl = document.getElementById('panel');
const panel = document.getElementById('panel-body');
const sheetHandle = panelEl.querySelector('.sheet-handle');
const phone = matchMedia('(max-width: 720px)');
// On a phone the panel is a sheet: folded to one line until opened, and folded again when the city is the point.
function setCollapsed(c) {
  panelEl.classList.toggle('collapsed', c);
  sheetHandle.setAttribute('aria-expanded', String(!c));
  sheetHandle.textContent = t('Legend');
  sheetHandle.setAttribute('aria-label', t(c ? 'Show legend' : 'Hide legend'));
}
let sheetSwiped = false;
sheetHandle.onclick = () => { if (sheetSwiped) { sheetSwiped = false; return; } setCollapsed(!panelEl.classList.contains('collapsed')); };
// On a phone the open legend folds when the map is touched, or when its bar is swiped down.
let sheetDown = null;
sheetHandle.addEventListener('pointerdown', e => { sheetDown = e.clientY; });
sheetHandle.addEventListener('pointerup', e => {
  if (sheetDown !== null && e.clientY - sheetDown > 30) { setCollapsed(true); sheetSwiped = true; }
  sheetDown = null;
});
document.getElementById('scene')?.addEventListener('pointerdown', () => {
  if (phone.matches && !panelEl.classList.contains('collapsed')) setCollapsed(true);
});
function collapsePanelOnPhone() { if (phone.matches) setCollapsed(true); }
// On a phone, choosing Layers in the mode bar opens the list of layers.
document.querySelector(`.modes button[data-mode="${MODE.layers}"]`)?.addEventListener('click', () => { if (phone.matches) setCollapsed(false); });
setCollapsed(phone.matches);
// A theme counts its monuments, not every building in their surroundings: in the legend, the timeline and the tally.
const HIST = !THEME ? config.histogram : THEME.markers.reduce((h, m) => {
  (h[m[8]] ||= periods.map(() => 0))[periods.indexOf(periodOf(m[8]))]++;
  return h;
}, {});
// a layer group's buildings per year, and how many buildings a layer or group holds; in a theme only its monuments
const hasBit = (gid, bit) => (attrs.getUint32(gid * config.attrStride + (bit < 32 ? 20 : 24), true) >>> (bit % 32)) & 1;
const groupYears = g => !THEME ? g.years : THEME.markers.reduce((h, m) => {
  if (hasBit(m[2], g.bit)) h[m[8]] = (h[m[8]] || 0) + 1;
  return h;
}, {});
const markersWith = bits => THEME.markers.filter(m => bits.some(b => hasBit(m[2], b))).length;
const layerCount = L => THEME ? markersWith(L.groups.map(g => g.bit)) : L.count;
const groupCount = g => THEME ? markersWith([g.bit]) : g.count;
const totals = periods.map(() => 0);
for (const v of Object.values(HIST)) v.forEach((n, i) => totals[i] += n);
const fmt = n => n.toLocaleString(fmtLocale());
let activeLayer = null;
const SECTION_ORDER = ['Discover', 'Architecture', 'Trade and empire', 'Art and craft', 'Science and learning',
  'Faith and community', 'Countries and communities', 'The modern city', 'War and occupation'];
const groupOn = {};
let maskTarget = periods.map(() => 1);

const ICON = {
  'Buildings today': '<path d="M2.5 14.5h11"/><rect x="3" y="8" width="2.6" height="6.5"/><rect x="6.7" y="4" width="2.6" height="10.5"/><rect x="10.4" y="6" width="2.6" height="8.5"/>',
  'Art and craft': '<path d="M6 1.5h4M6.6 1.5v2.6C4.2 5.5 3.6 8 4 10.5c.4 2.4 1.9 4 4 4s3.6-1.6 4-4c.4-2.5-.2-5-2.6-6.4V1.5"/><path d="M5.2 8.5c1.8.8 3.8.8 5.6 0"/>',
  'Science and learning': '<path d="M6 1.5h4M6.8 1.5v4.5L3 13.2c-.4.7.1 1.3.9 1.3h8.2c.8 0 1.3-.6.9-1.3L9.2 6V1.5"/><path d="M4.6 10.5h6.8"/>',
  'Discover': '<circle cx="8" cy="8" r="6.2"/><path d="M10.6 5.4 9 9 5.4 10.6 7 7z"/>',
  'Architecture': '<path d="M3 14.5V7l5-4.5L13 7v7.5z"/><path d="M6.5 14.5v-4h3v4"/>',
  'Trade and empire': '<path d="M2 11h12l-1.8 3H3.8z"/><path d="M8 2v9M8 3l4.5 6H8"/>',
  'Faith and community': '<path d="M8 1.5v4M6.2 3.3h3.6"/><path d="M4 14.5V8.5L8 5.5l4 3v6z"/><path d="M7 14.5v-3h2v3"/>',
  'The modern city': '<rect x="2.5" y="5" width="5" height="9.5"/><rect x="8.5" y="2" width="5" height="12.5"/><path d="M4.5 7.5h1M4.5 10h1M10.5 4.5h1M10.5 7h1M10.5 9.5h1"/>',
  'War and occupation': '<path d="M8 1.8 13 4v4c0 3.2-2.2 5.3-5 6.3-2.8-1-5-3.1-5-6.3V4z"/>',
};
const sectionIcon = sec => `<svg class="icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">${ICON[sec] || ''}</svg>`;

const backToLayers = () => { uniforms.uMode.value = MODE.layers; renderPanel(); drawHist(); };
function renderPanel() {
  if (ARCH.on) { renderArcheoPanel(); return; }
  const mode = uniforms.uMode.value;
  if (mode === MODE.period) {
    panel.innerHTML = `<h2>${t('Built in')}</h2><div class="swatches">${periods.map((p, i) => `
      <button class="swatch" data-i="${i}" aria-pressed="${!!maskTarget[i]}">
        <i style="background:${p.color}"></i><span>${t(p.label)}</span><span class="n">${fmt(totals[i])}</span>
      </button>`).join('')}</div>
      <p class="note">${t('Click a period to see it alone. Paler buildings have an approximate year.')}</p>`;
    panel.querySelectorAll('.swatch').forEach(b => b.onclick = () => {
      const i = +b.dataset.i, m = maskTarget;
      const solo = m.every((v, j) => (j === i) === !!v);
      maskTarget = periods.map((_, j) => (solo || j === i) ? 1 : 0);
      renderPanel(); drawHist();
    });
  } else if (mode === MODE.floors) {
    // where the storeys come from, for every building or, in a theme, for its monuments
    const [bag3d, byHeight] = THEME ? THEME.markers.reduce((a, m) => (a[attrs.getUint8(m[2] * config.attrStride + 10) ? 1 : 0]++, a), [0, 0])
      : [config.stats.floorsBag3d, config.stats.floorsHeight];
    const what = THEME ? THEME.noun[LANG === 'nl' ? 3 : 1] : LANG === 'nl' ? 'gebouwen' : 'buildings';
    panel.innerHTML = `<button class="back">${t('All layers')}</button><h2 class="layer-title">${sectionIcon('Buildings today')}${t('Storeys')}</h2>
      <div class="ramp" style="background:linear-gradient(90deg,#dbe3e6,#7da8bf,#2b5c8c,#0d1a40)"></div>
      <div class="ramp-scale"><span>1</span><span>3</span><span>8</span><span>20</span><span>40+</span></div>
      <p class="note">${LANG === 'nl' ? `${fmt(bag3d)} ${what} krijgen hun verdiepingen uit het 3D BAG-model; de rest, ${fmt(byHeight)}, uit hun hoogte gedeeld door 3,2 m.` : `${fmt(bag3d)} ${what} take their storeys from the 3D BAG model; the rest, ${fmt(byHeight)}, from their height divided by 3.2 m.`}</p>`;
    panel.querySelector('.back').onclick = backToLayers;
  } else if (mode === MODE.energy) {
    const e = config.energy;
    panel.innerHTML = `<button class="back">${t('All layers')}</button><h2 class="layer-title">${sectionIcon('Buildings today')}${t('Energy label')}</h2><div class="energy-scale">${e.labels.map((l, i) => `
      <div><i style="background:${ENERGY_COLORS[i + 1]}"></i><span>${l}</span><span class="n">${fmt(e.counts[i + 1])}</span></div>`).reverse().join('')}</div>
      <p class="note">${LANG === 'nl' ? `Het label dat de meeste woningen in een gebouw hebben. ${fmt(e.counts[0])} gebouwen, wit op de kaart, hebben geen geregistreerd label.` : `The label most homes in a building carry. ${fmt(e.counts[0])} buildings, white on the map, have no registered label.`}</p>
      <a class="src" href="https://www.atlasleefomgeving.nl/energielabels-van-gebouwen" target="_blank" rel="noopener">${t('RVO energy labels, via Atlas Leefomgeving')}</a>`;
    panel.querySelector('.back').onclick = backToLayers;
  } else if (activeLayer && activeLayer === residentsLayer) {
    const notes = Object.entries(residentsLayer?.notes || {});
    const people = notes.flatMap(([bag, n]) => n.people.map(p => ({ ...p, bag, at: n.at })))
      .sort((a, b) => b.links - a.links);
    panel.innerHTML = `<button class="back">${t('All layers')}</button><h2 class="layer-title">${esc(tr(residentsLayer, 'title'))}</h2>
      <button class="make-walk">${t('Generate a walk')}</button>
      <p class="layer-intro">${esc(tr(residentsLayer, 'text') || '')}</p>
      <input class="filter" type="search" placeholder="${t('Find a person')}" aria-label="${t('Find a person')}">
      <ul class="stories people">${people.map(p => `<li data-q="${esc((p.person + ' ' + (p.desc || '')).toLowerCase())}">
        <button class="story" data-bag="${p.bag}"><b>${esc(p.person)}</b>
        <span>${[p.born && p.died ? `${p.born}–${p.died}` : p.born, p.desc].filter(Boolean).map(esc).join(', ')}</span>
        <span class="addr">${esc(p.address)}</span></button></li>`).join('')}</ul>
      ${residentsLayer?.caveat ? `<p class="caveat">${esc(tr(residentsLayer, 'caveat'))}</p>` : ''}`;
    panel.querySelector('.back').onclick = () => setLayer(null);
    panel.querySelector('.make-walk').onclick = () => { collapsePanelOnPhone(); walkFromLayer(residentsLayer); };
    panel.querySelector('.filter').oninput = e => {
      const q = e.target.value.toLowerCase();
      panel.querySelectorAll('.people li').forEach(li => { li.hidden = q && !li.dataset.q.includes(q); });
    };
    panel.querySelectorAll('.story').forEach(b => b.onclick = () => {
      const n = residentsLayer.notes[b.dataset.bag];
      collapsePanelOnPhone();
      flyTo(n.at[0], n.at[1], () => { const gid = gidOf(b.dataset.bag); if (gid >= 0) pinCard(gid, innerWidth * 0.62, innerHeight * 0.18); });
    });
  } else if (!activeLayer) {
    // a theme lists only the layers that hold some of its monuments
    const listed = THEME ? contextLayers.filter(L => layerCount(L)) : contextLayers;
    const sections = [...new Set(listed.map(L => L.section))].sort((a, b) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b));
    const secTitle = sec => tr(listed.find(L => L.section === sec), 'section');
    panel.innerHTML = `<nav class="jump" aria-label="${t('Layers')}">${sections.map(sec => `
      <button data-sec="${esc(sec)}" title="${esc(secTitle(sec))}" aria-label="${esc(secTitle(sec))}">${sectionIcon(sec)}</button>`).join('')}</nav>` +
      sections.map(sec => `<h2 class="section" id="sec-${sec.replace(/\W+/g, '-')}">${sectionIcon(sec)}${esc(secTitle(sec))}</h2><div class="layers">${listed.filter(L => L.section === sec).map(L => `
      <button class="layer" data-id="${L.id}">
        <b>${esc(tr(L, 'title'))}</b><span class="n">${fmt(layerCount(L))}</span><span class="era">${esc(tr(L, 'era'))}</span>
      </button>`).join('')}</div>`).join('');
    // The buildings as they are today: storeys and energy labels, first in the list.
    const labelled = THEME ? THEME.markers.filter(m => attrs.getUint8(m[2] * config.attrStride + 32)).length
      : config.energy.counts.slice(1).reduce((a, b) => a + b, 0);
    panel.querySelector('.jump').insertAdjacentHTML('afterbegin', `<button data-sec="today" title="${t('Buildings today')}" aria-label="${t('Buildings today')}">${sectionIcon('Buildings today')}</button>`);
    panel.querySelector('.jump').insertAdjacentHTML('afterend', `<h2 class="section" id="sec-today">${sectionIcon('Buildings today')}${t('Buildings today')}</h2>
      <div class="layers"><button class="layer view" data-view="floors"><b>${t('Storeys')}</b><span class="n">${fmt(THEME ? THEME.markers.length : config.stats.buildings)}</span><span class="era">${t('3D BAG')}</span></button>
      ${labelled ? `<button class="layer view" data-view="energy"><b>${t('Energy label')}</b><span class="n">${fmt(labelled)}</span><span class="era">${t('RVO')}</span></button>` : ''}</div>`);
    panel.querySelectorAll('.layer.view').forEach(b => b.onclick = () => setBuildingView(MODE[b.dataset.view]));
    panel.querySelectorAll('.jump button').forEach(b => b.onclick = () =>
      panel.querySelector(`#sec-${b.dataset.sec.replace(/\W+/g, '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    panel.querySelectorAll('.layer:not(.view)').forEach(b => b.onclick = () => {
      const L = contextLayers.find(l => l.id === b.dataset.id);
      setLayer(L); fitToLayer(L);
    });
  } else {
    panel.innerHTML = `<button class="back">${t('All layers')}</button>
      <h2 class="layer-title">${sectionIcon(activeLayer.section)}${esc(tr(activeLayer, 'title'))}</h2><p class="layer-era">${esc(tr(activeLayer, 'era'))}</p>
      ${Object.values(activeLayer.notes || {}).some(n => n.at) ? `<button class="make-walk">${t('Generate a walk')}</button>` : ''}${layerDetail(activeLayer)}`;
    panel.querySelector('.make-walk')?.addEventListener('click', () => { collapsePanelOnPhone(); walkFromLayer(activeLayer); });
    panel.querySelector('.back').onclick = () => setLayer(null);
    panel.querySelectorAll('.story').forEach(b => b.onclick = () => {
      const n = activeLayer.notes[b.dataset.bag];
      collapsePanelOnPhone();
      flyTo(n.at[0], n.at[1], () => {
        const gid = gidOf(b.dataset.bag);
        if (gid >= 0) pinCard(gid, innerWidth * 0.62, innerHeight * 0.18);
      });
    });
    panel.querySelectorAll('.swatch').forEach(b => b.onclick = () => {
      groupOn[b.dataset.bit] = groupOn[b.dataset.bit] === false;
      setLayer(activeLayer); fitToLayer(activeLayer);
    });
  }
}

function layerDetail(L) {
  const groups = L.groups.length > 1 ? `<div class="swatches">${L.groups.map((g, i) => `
    <button class="swatch" data-bit="${g.bit}" aria-pressed="${groupOn[g.bit] !== false}">
      <i style="background:${GROUP_COLORS[i]}"></i><span>${esc(tr(g, 'label'))}</span><span class="n">${fmt(groupCount(g))}</span>
    </button>`).join('')}</div>` : '';
  // One line per story: a building made of several BAG parts carries the same note on each.
  const seenName = new Set();
  const named = Object.entries(L.notes || {}).filter(([, n]) => n.name && n.at && !seenName.has(n.name) && seenName.add(n.name));
  const stories = named.length ? `<h2 class="section">${t('Buildings and their stories')}</h2><ul class="stories">${named.map(([bag, n]) => `
    <li><button class="story" data-bag="${bag}"><b>${esc(tr(n, 'name'))}</b><span>${esc(tr(n, 'story'))}</span></button></li>`).join('')}</ul>` : '';
  return `<div class="layer-detail"><p>${esc(tr(L, 'text'))}</p>${groups}${stories}
    ${L.caveat ? `<p class="caveat">${esc(tr(L, 'caveat'))}</p>` : ''}
    <a href="${L.source.url}" target="_blank" rel="noopener">${esc(tr(L.source, 'label'))}</a></div>`;
}

function fitToLayer(L) {
  if (!L) return;
  const bits = L.groups.filter(g => groupOn[g.bit] !== false).map(g => g.bit);
  if (!bits.length) return;
  const xs = [], zs = [], n = config.stats.buildings, st = config.attrStride;
  for (let gid = 0; gid < n; gid++) {
    const o = gid * st, lay0 = attrs.getUint32(o + 20, true), lay1 = attrs.getUint32(o + 24, true);
    if (bits.some(b => b < 32 ? (lay0 >>> b) & 1 : (lay1 >>> (b - 32)) & 1)) {
      xs.push(attrs.getFloat32(o + 36, true)); zs.push(attrs.getFloat32(o + 40, true));
    }
  }
  if (!xs.length) return;
  const cut = a => { a.sort((p, q) => p - q); const k = a.length > 50 ? Math.floor(a.length * 0.02) : 0; return [a[k], a[a.length - 1 - k]]; };
  const [x0, x1] = cut(xs), [z0, z1] = cut(zs);
  // On a wide screen the panel covers the left of the view: frame the points in the part to its right.
  const pr = !phone.matches && !panelEl.classList.contains('collapsed') ? panelEl.getBoundingClientRect().right : 0;
  const free = Math.max(0.4, 1 - pr / innerWidth);
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const span = Math.max(z1 - z0, (x1 - x0) / (camera.aspect * free), 120);
  const distance = Math.min(THEME ? controls.maxDistance : 7000, Math.max(320, span / 2 / half * 1.35));
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const shift = (pr / innerWidth / 2) * 2 * distance * half * camera.aspect;
  const cx = (x0 + x1) / 2 - right.x * shift, cz = (z0 + z1) / 2 - right.z * shift;
  if (Number.isFinite(cx) && Number.isFinite(cz) && Number.isFinite(distance)) flyTo(cx, cz, null, distance);
}

function setLayer(L) {
  if (L) uniforms.uLayerAt.value = performance.now() / 1000;
  activeLayer = L;
  const bits = Array(MAX_GROUPS).fill(-1);
  if (L) L.groups.forEach((g, i) => { if (i < MAX_GROUPS && groupOn[g.bit] !== false) bits[i] = g.bit; });
  uniforms.uGroupBit.value = bits;
  renderPanel(); drawHist(); colorMarkers();
}

document.querySelectorAll('.modes button[data-mode]').forEach(b => b.onclick = () => {
  uniforms.uMode.value = +b.dataset.mode;
  document.querySelectorAll('.modes button[data-mode]').forEach(x => x.setAttribute('aria-pressed', x === b));
  const bits = Array(MAX_GROUPS).fill(-1);
  if (activeLayer) activeLayer.groups.forEach((g, i) => { if (groupOn[g.bit] !== false) bits[i] = g.bit; });
  uniforms.uGroupBit.value = bits;
  if (uniforms.uMode.value === MODE.layers && activeLayer) uniforms.uLayerAt.value = performance.now() / 1000;
  // On a phone the sheet opens only when there is a choice to make: a layer to pick.
  if (!phone.matches || (uniforms.uMode.value === MODE.layers && !activeLayer)) setCollapsed(false);
  renderPanel(); drawHist(); colorMarkers();
});

// ---------- Timeline ----------
const hist = document.getElementById('hist');
const hctx = hist.getContext('2d');
const T0 = Math.floor(config.yearMin / 50) * 50, T1 = config.yearMax + 1;
const years = Object.entries(HIST).map(([y, v]) => [+y, v]);
const yMax = Math.max(...years.map(([, v]) => v.reduce((a, b) => a + b, 0)));
const xOf = y => (y - T0) / (T1 - T0) * hist.clientWidth;
const yearOf = x => Math.round(T0 + x / hist.clientWidth * (T1 - T0));

function layerGroupsShown() {
  if (uniforms.uMode.value !== MODE.layers || !activeLayer) return [];
  return activeLayer.groups.map((g, i) => ({ ...g, color: GROUP_COLORS[i] })).filter(g => groupOn[g.bit] !== false);
}

function visibleCount() {
  const Y = uniforms.uYear.value;
  const shown = layerGroupsShown();
  if (shown.length) return shown.reduce((n, g) => n + Object.entries(groupYears(g)).reduce((m, [y, c]) => m + (+y <= Y ? c : 0), 0), 0);
  let n = 0;
  for (const [y, v] of years) if (y <= Y) v.forEach((c, i) => { if (uniforms.uMode.value !== MODE.period || maskTarget[i]) n += c; });
  return n;
}

function drawHist() {
  const w = hist.clientWidth, h = hist.clientHeight, dpr = devicePixelRatio;
  hist.width = w * dpr; hist.height = h * dpr;
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hctx.clearRect(0, 0, w, h);
  const plotH = h - 20, bw = Math.max(1, w / (T1 - T0));
  const Y = uniforms.uYear.value, Yf = uniforms.uYearFrom.value;
  const shown = layerGroupsShown();
  const bar = (y, bh, top, color, on) => {
    hctx.fillStyle = color;
    hctx.globalAlpha = on ? (y <= Yf ? 0.3 : 1) : 0.18;
    hctx.fillRect(xOf(y), top - bh, bw, bh);
  };
  if (shown.length) {
    // Layer mode: the city in grey behind, the layer's own buildings in its colours.
    for (const [y, v] of years) {
      const bh = Math.sqrt(v.reduce((a, b) => a + b, 0) / yMax) * (plotH - 6);
      bar(y, bh, plotH, '#b9c0c4', false);
    }
    // Stack the groups per year; the stack's total height follows sqrt(total), split in proportion.
    const total = {};
    const gy = shown.map(groupYears);
    for (const v of gy) for (const [y, c] of Object.entries(v)) total[y] = (total[y] || 0) + c;
    const lMax = Math.max(1, ...Object.values(total));
    const stack = {};
    shown.forEach((g, k) => { for (const [ys, c] of Object.entries(gy[k])) {
      const y = +ys, full = Math.sqrt(total[ys] / lMax) * (plotH - 6) * 0.9, bh = full * c / total[ys];
      bar(y, bh, plotH - (stack[y] || 0), g.color, y <= Y);
      stack[y] = (stack[y] || 0) + bh;
    } });
  } else {
    for (const [y, v] of years) {
      let top = plotH;
      v.forEach((c, i) => {
        if (!c) return;
        const bh = Math.sqrt(c / yMax) * (plotH - 6);
        const masked = uniforms.uMode.value === MODE.period && !maskTarget[i];
        bar(y, bh, top, periods[i].color, !masked && y <= Y);
        top -= bh;
      });
    }
  }
  hctx.globalAlpha = 1;
  hctx.fillStyle = '#5d6266';
  hctx.font = '500 11px "Schibsted Grotesk", sans-serif';
  const step = w < 500 ? 200 : 100;
  for (let y = Math.ceil(T0 / step) * step; y <= T1; y += step) hctx.fillText(y, Math.min(w - 28, Math.max(0, xOf(y) - 13)), h - 4);
  hctx.fillStyle = '#000';
  hctx.fillRect(xOf(Y) - 1, 0, 2, plotH);
  if (Yf >= T0) { hctx.fillStyle = '#5d6266'; hctx.fillRect(xOf(Yf) - 0.5, 0, 1, plotH); }
  // at the end of the timeline the map shows the city as it stands, not a year that reads like a date
  document.getElementById('year').textContent = ARCH.on ? t('Underground') : Y >= config.yearMax ? t('Today') : Math.round(Y);
  document.getElementById('count').textContent = fmt(ARCH.on ? ARCH.data?.areas.length || 0 : visibleCount());
}

let handle = null;
hist.addEventListener('pointerdown', e => {
  hist.setPointerCapture(e.pointerId);
  const x = e.offsetX;
  handle = Math.abs(x - xOf(uniforms.uYearFrom.value)) < Math.abs(x - xOf(uniforms.uYear.value)) ? 'uYearFrom' : 'uYear';
  moveHandle(x);
  stopPlay();
});
hist.addEventListener('pointermove', e => handle && moveHandle(e.offsetX));
hist.addEventListener('pointerup', () => handle = null);
function moveHandle(x) {
  const y = Math.max(T0, Math.min(config.yearMax, yearOf(x)));
  if (handle === 'uYear') uniforms.uYear.value = Math.max(y, uniforms.uYearFrom.value + 1);
  else uniforms.uYearFrom.value = Math.min(y, uniforms.uYear.value - 1);
  drawHist();
}

// Play: quickly through the sparse centuries, then slowly through the dense ones.
// With repeat on the film runs back and forth: at today it turns and the city shrinks to its start, then grows again,
// resting HOLD at either end before it turns.
const HOLD = 10000;
let playing = false, playT0 = 0, playStart = 0, playDir = 1, playHold = 0, repeat = false;
const playBtn = document.getElementById('play');
const repeatBtn = document.getElementById('repeat');
const playIcon = document.getElementById('play-icon');
const DURATION = (+new URLSearchParams(location.search).get('film') || 30) * 1000; // ?film=6 for a short film
// A theme spends the film's time evenly over its monuments, from a little before the first was built to today.
const playYears = THEME && [THEME.markers[0][8] - 10, ...THEME.markers.map(m => m[8]), config.yearMax];
function playYear(t) {
  if (playYears) {
    const i = t * (playYears.length - 1), k = Math.min(Math.floor(i), playYears.length - 2);
    return playYears[k] + (playYears[k + 1] - playYears[k]) * (i - k);
  }
  const k = 0.35; // share of time spent before 1850
  return t < k ? T0 + (1850 - T0) * (t / k) : 1850 + (config.yearMax - 1850) * ((t - k) / (1 - k));
}
function startPlay() {
  playing = true; playStart = performance.now(); playDir = 1; playHold = 0;
  if (uniforms.uYear.value >= config.yearMax) uniforms.uYear.value = T0;
  playT0 = 0;
  while (playT0 < 1 && playYear(playT0) < uniforms.uYear.value) playT0 += 0.001;
  playIcon.setAttribute('d', 'M4 2.5h3v11H4zM9 2.5h3v11H9z');
  uniforms.uPlaying.value = 1;
  playBtn.setAttribute('aria-label', t('Pause'));
}
function stopPlay() {
  playing = false;
  uniforms.uPlaying.value = 0;
  uniforms.uRise.value = 0.01;
  uniforms.uYear.value = Math.round(uniforms.uYear.value);
  playIcon.setAttribute('d', 'M4 2.5v11l9-5.5z');
  playBtn.setAttribute('aria-label', "Play the city's growth");
}
playBtn.onclick = () => playing ? stopPlay() : startPlay();
repeatBtn.onclick = () => { repeat = !repeat; repeatBtn.setAttribute('aria-pressed', String(repeat)); };

// ---------- Loop ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  drawHist();
}
addEventListener('resize', resize);
// ---------- Search ----------
// The index (pipeline/s14_search.py) loads on the first use of the search box: street names and named buildings.
// House numbers live in one file per first letter of the street, loaded when needed.
let index = null;
const shards = {};
const normal = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const shardOf = key => /^[a-z]/.test(key) ? key[0] : '0';
function loadIndex() {
  index ??= fetch(D + 'search/index.json').then(r => r.json()).then(d => {
    d.streets = d.streets.map(([n, nb]) => ({ n, nb, key: normal(n) }));
    d.names.forEach(n => { n.key = normal(n[0]); n.keyNl = n[1] ? normal(n[1]) : null; });
    return d;
  });
  return index;
}
function numbersOf(st) {
  const k = shardOf(st.key);
  shards[k] ??= fetch(`${D}search/${k}.json`).then(r => r.json());
  return shards[k].then(sh => sh[st.n] || []);
}
const findInput = document.getElementById('find-input');
const findList = document.getElementById('find-results');
const findSel = document.getElementById('find-sel');
// The field stands just right of the mode bar, whose width depends on the language and the fonts.
const findBox = findInput.closest('.find'), modesBar = document.querySelector('.modes');
function placeFind() {
  if (phone.matches) { findBox.style.left = ''; return; }
  // while in use it widens, and must stay on screen
  const open = findBox.matches(':focus-within') || !findSel.hidden;
  const w = open ? 300 : findBox.offsetWidth;
  findBox.style.left = `${Math.min(modesBar.getBoundingClientRect().right + 8, innerWidth - w - 16)}px`;
}
addEventListener('resize', placeFind);
document.fonts?.ready.then(placeFind);
setTimeout(placeFind, 0);
findInput.addEventListener('focus', placeFind);
findInput.addEventListener('blur', () => setTimeout(placeFind, 200));
let results = [], active = -1, searchSeq = 0;

const streetsFor = (d, k) => d.streets.filter(st => st.key.startsWith(k))
  .concat(d.streets.filter(st => !st.key.startsWith(k) && st.key.includes(k)));
async function search(q, d) {
  const k = normal(q);
  if (k.length < 2) return [];
  const out = [];
  const m = k.match(/^(.*\D)\s*(\d+)\s*([a-z]?)$/);
  if (m) {
    const want = +m[2], letter = m[3] || '', sk = m[1].trim();
    const streets = streetsFor(d, sk).slice(0, 4);
    const nums = await Promise.all(streets.map(numbersOf));
    streets.forEach((st, i) => {
      const a = nums[i];
      const exact = a.find(x => x[0].toLowerCase() === `${want}${letter}`) || a.find(x => parseInt(x[0]) === want);
      if (exact) { out.push({ kind: 'address', label: `${st.n} ${exact[0]}`, gid: exact[1] }); return; }
      // not in the register: the nearest number on the same side of the street
      const near = a.filter(x => parseInt(x[0]) % 2 === want % 2)
        .sort((p, q) => Math.abs(parseInt(p[0]) - want) - Math.abs(parseInt(q[0]) - want))[0];
      if (near) out.push({ kind: 'address', label: `${st.n} ${near[0]}`, gid: near[1],
        note: t('{n} is not in the register; nearest on the same side').replace('{n}', `${st.n} ${want}${letter}`) });
    });
  }
  const starts = n => n.key.startsWith(k) || !!n.keyNl?.startsWith(k);
  const named = d.names.filter(n => n.key.includes(k) || n.keyNl?.includes(k)).sort((p, q) => starts(q) - starts(p));
  for (const n of named.slice(0, 5)) out.push({ kind: n[3], label: LANG === 'nl' && n[1] ? n[1] : n[0], gid: n[2] });
  if (!m) for (const st of streetsFor(d, k).slice(0, 4)) out.push({ kind: 'street', label: st.n, street: st });
  return out.slice(0, 8);
}
const KIND = { address: 'Address', building: 'Building', person: 'Lived here', street: 'Street' };
function renderResults() {
  findList.innerHTML = results.map((r, i) => `<li role="option" data-i="${i}" aria-selected="${i === active}">
    <b>${esc(r.label)}</b><span>${t(KIND[r.kind])}${r.kind === 'street' ? ` · ${fmt(r.street.nb)} ${t('buildings')}` : ''}</span>
    ${r.note ? `<em>${esc(r.note)}</em>` : ''}</li>`).join('') || (findInput.value.trim().length > 1 ? `<li class="none">${t('Nothing found')}</li>` : '');
  findList.hidden = !findList.innerHTML;
  findInput.setAttribute('aria-expanded', String(!findList.hidden));
  findList.querySelectorAll('[data-i]').forEach(li => li.onmousedown = e => { e.preventDefault(); choose(results[+li.dataset.i]); });
}
findInput.addEventListener('focus', loadIndex);
findInput.addEventListener('input', async () => {
  const seq = ++searchSeq;
  const d = await loadIndex();
  const r = await search(findInput.value, d);
  if (seq !== searchSeq) return;   // a later keystroke already searched
  results = r; active = results.length ? 0 : -1;
  renderResults();
});
findInput.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (results.length) active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
    renderResults();
  } else if (e.key === 'Enter' && results[active]) { choose(results[active]); }
  else if (e.key === 'Escape') { findList.hidden = true; findInput.blur(); }
  e.stopPropagation();
});
findInput.addEventListener('blur', () => setTimeout(() => { findList.hidden = true; }, 150));

// A walk's or the graph's buildings carry their group's colour while the rest of the city is a plain model.
function setFocus(gids, groups) {
  for (let i = 1; i < pickData.length; i += 4) pickData[i] = 0;
  gids.forEach((g, k) => { pickData[g * 4 + 1] = groups[k] + 1; });
  pickTex.needsUpdate = true;
  uniforms.uFocusN.value = gids.length;
}
// What the search found stays lit while the rest of the city dims.
let found = null;
function setLit(gids) {
  for (let i = 0; i < pickData.length; i += 4) pickData[i] = 0;
  for (const g of gids) pickData[g * 4] = 255;
  pickTex.needsUpdate = true;
  uniforms.uPickOn.value = gids.length ? 1 : 0;
}
function clearFound() {
  found = null; findSel.hidden = true; setLit([]); orbit = false; placeFind();
}
async function choose(r) {
  findList.hidden = true; findInput.blur();
  findInput.value = r.label;
  found = r;
  renderSel();
  if (r.kind === 'street') {
    const gids = [...new Set((await numbersOf(r.street)).map(a => a[1]))];
    if (found !== r || !gids.length) return;
    setLit(gids);
    pinCard(-1);
    const bs = gids.map(building), xs = bs.map(b => b.x), zs = bs.map(b => b.z);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 150);
    flyTo((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2, null, Math.min(5000, span * 1.5));
  } else {
    setLit([r.gid]);
    const b = building(r.gid);
    flyTo(b.x, b.z, () => { if (found === r) { pinCard(r.gid, innerWidth * 0.62, innerHeight * 0.2); orbit = true; } }, 300);
  }
}
function renderSel() {
  if (!found) { findSel.hidden = true; return; }
  findSel.innerHTML = `<span>${esc(found.label)}</span><button class="sel-clear" aria-label="${t('Clear')}">×</button>`;
  findSel.hidden = false;
  placeFind();
  findSel.querySelector('.sel-clear').onclick = () => { clearFound(); findInput.value = ''; };
}
addEventListener('keydown', e => { if (e.key === 'Escape' && found && !document.querySelector('dialog[open]')) { clearFound(); findInput.value = ''; } });

// The camera slowly circles what was found, until the viewer takes over.
let orbit = false;
canvas.addEventListener('pointerdown', () => { orbit = false; });
canvas.addEventListener('wheel', () => { orbit = false; }, { passive: true });
controls.autoRotateSpeed = 0.6;
const orbitTick = () => { controls.autoRotate = orbit && !flight; requestAnimationFrame(orbitTick); };
orbitTick();

function applyStaticText() {
  document.querySelector('.gz-toggle span').textContent = t('Protected townscapes');
  document.documentElement.lang = LANG;
  const where = config.label.split(' in ').pop();
  document.querySelector('.dek').textContent = !THEME ? t('Every building standing today, by age and historical context.')
    : LANG === 'nl' ? `Elke rijksmonumentale ${THEME.noun[2]} in ${where}, in zijn omgeving.`
    : `Every listed ${THEME.noun[0]} in ${where}, in its surroundings.`;
  document.querySelector('.about-open').textContent = t('About');
  setTimeout(placeFind, 0);
  findInput.placeholder = t('Search'); findInput.setAttribute('aria-label', t('Search a building, address or street'));
  if (found) renderSel();
  document.querySelector('.walks-open span').textContent = LANG === 'nl' ? 'Route' : 'Walk';
  document.querySelectorAll('[data-lang-block]').forEach(a => { a.hidden = a.dataset.langBlock !== LANG; });
  document.querySelectorAll('.modes button[data-mode]').forEach(b => { b.textContent = t(b.dataset.label); });
  document.querySelector('.graph-open span').textContent = t('Graph');
  document.querySelector('.graph-open').href = graphHref();
  // the switch names where it goes: under the ground, or back to the city as built
  archBtn.querySelector('span').textContent = t(ARCH.on ? 'Built' : 'Archaeology');
  archBtn.title = t(ARCH.on ? 'Back to the city as built' : 'Turn the city over: what lies under the ground');
  document.querySelector('.tally-count').childNodes[1].textContent = ' ' + (ARCH.on ? t('research areas') : THEME ? THEME.noun[LANG === 'nl' ? 3 : 1] : t('buildings'));
  document.querySelector('.howto').textContent = t('Drag to turn. Right-drag or Shift-drag to move. Scroll to zoom.');
  for (const [cls, label] of [['zoom-in', 'Zoom in'], ['zoom-out', 'Zoom out'], ['zoom-home', 'Overview']]) {
    const b = document.querySelector('.' + cls);
    b.title = t(label); b.setAttribute('aria-label', t(label));
  }
  const ld = document.getElementById('loading'); if (ld.firstChild) ld.firstChild.textContent = t('Building the city') + ' ';
  playBtn.setAttribute('aria-label', t(playing ? 'Pause' : "Play the city's growth"));
  repeatBtn.setAttribute('aria-label', t('Repeat')); repeatBtn.title = t('Repeat');
  document.querySelectorAll('.lang [data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === LANG));
  sheetHandle.textContent = t('Legend');
  sheetHandle.setAttribute('aria-label', t(panelEl.classList.contains('collapsed') ? 'Show legend' : 'Hide legend'));
}
document.querySelectorAll('.modes button[data-mode]').forEach(b => { b.dataset.label = b.textContent.trim(); });
const about = document.getElementById('about');
document.querySelector('.about-open').onclick = () => about.showModal();
about.querySelector('.about-close').onclick = () => about.close();
about.addEventListener('click', e => { if (e.target === about) about.close(); });

function setLang(l) {
  LANG = l;
  try { localStorage.setItem('lang', l); } catch {}
  const u = new URL(location.href); u.searchParams.set('lang', l); history.replaceState(null, '', u);
  applyStaticText(); renderPanel(); drawHist();
  if (pinnedGid >= 0) pinCard(pinnedGid, ...lastPin);
  if (walksDlg.open) renderWalkPlanner();
  if (walkRoute) renderWalk();
}
document.querySelectorAll('.lang [data-lang]').forEach(b => b.onclick = () => setLang(b.dataset.lang));
applyStaticText();
renderPanel();
resize();
document.fonts?.ready.then(drawHist);

let frame = 0;
renderer.setAnimationLoop(now => {
  frame++;
  stepFlight(now);
  stepFlip(now);
  uniforms.uNow.value = now / 1000;
  uniforms.uMask.value = maskTarget;
  controls.update();
  const dist = camera.position.distanceTo(controls.target);
  uniforms.uFog.value.set(dist * 1.6, dist * 4);
  if (frame % 6 === 0) updateLabels(dist);
  if (playing) {
    if (now < playHold) {
      // resting at an end: the last flights settle
      uniforms.uRise.value = Math.max(0.01, uniforms.uRise.value * 0.9);
    } else {
      if (playHold) { playHold = 0; playStart = now; }
      let t = playT0 + playDir * (now - playStart) / DURATION;
      // back at the start it always turns forward again; at today it turns back only with repeat on
      const turn = (playDir < 0 && t <= 0) || (playDir > 0 && t >= 1 && repeat);
      t = Math.max(0, Math.min(1, t));
      uniforms.uYear.value = playYear(t);
      // A flight lasts about 0.8 s on screen whatever the film's pace: as many years as the film covers in that time.
      const ahead = Math.max(0, Math.min(1, t + playDir * 800 / DURATION));
      uniforms.uRise.value = Math.max(2, Math.abs(playYear(ahead) - playYear(t)));
      if (turn) { playDir = -playDir; playT0 = t; playHold = now + HOLD; }
      else if (playDir > 0 && t >= 1) stopPlay();
      drawHist();
    }
  }
  stepTheme(now, dist);
  if (pointer && !dragging && !ARCH.on && frame % 3 === 0) {
    const mk = markerAt(pointer[0], pointer[1]);
    const gid = mk ? mk[2] : pick(pointer[0], pointer[1]);
    uniforms.uHover.value = gid;
    showCard(gid, pointer[0], pointer[1]);
  }
  renderer.render(scene, camera);
});


window.__dbg = { loadIndex, search, choose, numbersOf, pick, uniforms, camera, controls, setLayer, layers, pinCard, showCard, building, labelGroup, labels, flyTo, startPlay, gidOf };
