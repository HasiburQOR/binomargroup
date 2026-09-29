/* ============================================================
   Local company dataset (fallback when Sanity is not configured)
   Shape mirrors the Sanity schema in sanity/schema.js —
   fields added here should be added there too.

   logo: the company's whole logo (wordmark and all), shown on its card
   and its company page. logoMark: a square icon cut from it for the small
   round badges — the map tag, the card avatar, the finder, the phone
   chips, the tooltip (empty = the logo). logoBg: the tile colour behind
   both (empty = light; a white logo needs a dark one). Files live in
   assets/logos/. With no logo at all, the badge shows the initial on the
   brand colour (see assets/logos/README.md).
   ============================================================ */

window.LOCAL_COMPANIES = [
  {
    id: "traveldoor",
    name: "Traveldoor",
    industry: "travel",
    style: "modern-tower",
    tagline: "Your door to the world.",
    description: [
      "Travel Door, a leading Travel Agency in Georgia providing comprehensive travel services for both Groups as well as Individuals wishing to explore Caucasus Region since 2017. Our Team consists of highly trained professionals, experienced and educated in the field of travel, tourism and hospitality. We have a capacity to handle over 10000+ travelers monthly with a fleet size of 200+ vehicles. We currently operate in Caucasus region covering Georgia, Armenia and Azerbaijan. Even though Global Pandemic hindered the growth of travel industry and flow of tourists in Georgia, Travel Door maintained the growth momentum with percentage of our customers and partners doubling each year & average annual growth being 133%.",
      "Traveldoor is the flagship travel brand of Binomar Group — a full-service agency designing holidays, honeymoons, corporate trips and adventures across dozens of countries. One conversation, and a complete journey takes shape: flights, stays, transfers and experiences, all harmonised.",
      "With certified consultants, round-the-clock on-trip support and long-standing airline and hotel partnerships, Traveldoor turns complicated itineraries into effortless travel."
    ],
    color: "#0ea5e9",
    logo: "assets/logos/traveldoor.webp",
    logoMark: "assets/logos/traveldoor-mark.webp",
    logoBg: "#0f2340",           // the Travel Door logo is white: it sits on a deep navy tile
    floors: 9,
    plot: 1,
    featured: true,
    address: "52 Ketevan Dedofali Ave, Tbilisi 0101, Georgia",
    phone: "+995 511 333 699",
    email: "traveldoor@binomargroup.com",
    website: "https://traveldoor.ge/",
    founded: "2012"
  },
  {
    id: "maq-tourism",
    name: "MAQ Tourism",
    industry: "tourism",
    style: "chalet",
    tagline: "Unforgettable journeys, expertly crafted.",
    description: [
      "MAQ tourism is a destination Management company operating across Georgia offering a wide range of customized travel experiences — from cultural and historical tours to adventure, culinary, and nature-based packages.",
      "Whether you’re looking for a guided tour through ancient cities, a trek through breathtaking mountain ranges, or an immersive local experience, we are here to create unforgettable journeys tailored to your interests.",
      "MAQ Tourism designs signature tours and guided experiences for travellers who want more than a checklist. Small groups, hand-picked local guides and itineraries built around stories, food and landscapes.",
      "From cultural city breaks to incentive trips and special-interest tours, MAQ Tourism blends careful planning with room for spontaneity — the way travel should feel."
    ],
    color: "#14b8a6",
    logo: "assets/logos/maq-tourism.webp",
    logoMark: "assets/logos/maq-tourism-mark.webp",
    floors: 4,
    plot: 2,
    featured: true,
    address: "Ketevan Dedopali Avenue 52, Tbilisi, Georgia",
    phone: "+595 244 144",
    email: "info@maqtourism.com",
    website: "https://maqtourism.com/",
    founded: "2016"
  },
  {
    id: "hashtag-georgia",
    name: "Hashtag Georgia",
    industry: "dmc",
    style: "georgian",
    tagline: "Discover Georgia, one story at a time.",
    description: [
      "Georgia is on the shores of the Black Sea at the juncture of Europe and Asia. For ages, Georgia has served the world with its Silk Road. It may be one of the less traveled countries in Europe, but Georgia Tourism is gaining popularity in the last few years. The country is known as the hometown of wine and has three UNESCO sites. The world's oldest wine-producing country has a timeless charm that defines its vibrant towns, picturesque mountain villages, and rough mountain setting. For tourists looking for an upbeat European destination, Georgia tour packages are the best fit. This tiny country is often mistaken as a part of the Middle Eastern country, rather it is a part of Europe. With its ancient sites, warm hospitality, and fascinating wine traditions, there are plenty of tourist places in Georgia that offer rare experiences.",
      "Hashtag Georgia is the group's destination management company for the country of Georgia — Tbilisi's old town, the Caucasus mountains, and the wine regions of Kakheti. We handle ground services, MICE programmes and tailor-made routes for partners worldwide.",
      "Local teams, transparent operations and years of on-the-ground relationships mean every group lands in expert hands — from border to toast."
    ],
    color: "#e11d48",
    logo: "assets/logos/hashtag-georgia.webp",
    logoMark: "assets/logos/hashtag-georgia-mark.webp",
    floors: 6,
    plot: 3,
    featured: true,
    address: "Georgia House, Vine Street, Binomar District",
    phone: "+995 (555) 010-0303",
    email: "georgia@binomargroup.com",
    website: "https://hgeorgia.com/",
    founded: "2018"
  },
  {
    id: "traveldoor-outbound",
    name: "Traveldoor Outbound",
    industry: "outbound",
    style: "modern-office",
    tagline: "Visas, tickets and tours — worldwide.",
    description: [
      "Traveldoor Outbound is the group's specialist for international travel from the region: visa processing, worldwide air ticketing, study and work travel, and curated outbound packages to Europe, Asia, the Gulf and beyond.",
      "One desk for documents, bookings and departure-ready support — so travellers set off with confidence and everything in order."
    ],
    color: "#f97316",
    logo: "assets/logos/traveldoor.webp",         // the same Travel Door logo as the flagship
    logoMark: "assets/logos/traveldoor-mark.webp",
    logoBg: "#0f2340",
    floors: 5,
    plot: 4,
    featured: false,
    address: "52 Ketevan Dedofali Ave, Tbilisi, Georgia, 0101",
    phone: "+995 591 13 61 01",
    whatsapp: "+995 598 90 33 01",
    email: "info@traveldoor.ge",
    website: "https://www.facebook.com/outboundtraveldoor",
    founded: "2020"
  }
];