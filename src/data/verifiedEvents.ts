import type { CampusEvent } from '../types';

type RawEvent = Omit<CampusEvent, 'start' | 'end'> & { start: string; end: string };

/**
 * Real upcoming UMass Amherst events from public Campus Pulse listings (retrieved 2026-11-13).
 * Times keep their published UTC offset and display in the browser's local time zone.
 * Category is the host organization's MyClubs category. Saving an event does not RSVP or register.
 */
const RAW: RawEvent[] = [
  {
    "id": "cp-12912251",
    "title": "Fall 2026 Food Fair",
    "start": "2026-11-14T12:00:00-05:00",
    "end": "2026-11-14T15:00:00-05:00",
    "location": "Hampshire Dining Commons",
    "description": "Hungry? Come Feast with VSA! Get ready to eat your way through Vietnam at VSA's annual Food Fair! Join us for a delicious spread of traditional Vietnamese dishes inspired by the flavors of home and the bustling streets of Vietnam. From savory appetizers to sweet treats, there's something for everyone to enjoy! Bring your friends, come with an empty stomach, and explore the many flavors Vietnam has to offer.",
    "category": "Cultural",
    "clubId": "vietnamesestudentassociation",
    "host": "Vietnamese Students Association",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12912251",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12480829",
    "title": "VSA Escape Room",
    "start": "2026-12-07T18:00:00-05:00",
    "end": "2026-12-07T20:00:00-05:00",
    "location": "Black Box Theater",
    "description": "Come join VSA and solve fun puzzles from Vietnamese traditional games while trying to escape!",
    "category": "Cultural",
    "clubId": "vietnamesestudentassociation",
    "host": "Vietnamese Students Association",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12480829",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12940827",
    "title": "Wilderness First Aid Course (Wild Med)",
    "start": "2026-11-14T09:00:00-05:00",
    "end": "2026-11-14T17:00:00-05:00",
    "location": "Herter Room 111",
    "description": "Wild Med will be coming for a second weekend to teach a Wilderness First Aid course!",
    "category": "Sports & Recreation",
    "clubId": "umoc",
    "host": "Outing Club",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12940827",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12940828",
    "title": "Wilderness First Aid Course (Wild Med)",
    "start": "2026-11-15T09:00:00-05:00",
    "end": "2026-11-15T17:00:00-05:00",
    "location": "Herter Room 111",
    "description": "Wild Med will be coming for a second weekend to teach a Wilderness First Aid course!",
    "category": "Sports & Recreation",
    "clubId": "umoc",
    "host": "Outing Club",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12940828",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12955880",
    "title": "General Body Meeting: Coping with Family Stress",
    "start": "2026-11-16T19:00:00-05:00",
    "end": "2026-11-16T20:00:00-05:00",
    "location": "Bartlett Hall, Room 61",
    "description": "Join us for our general body meeting! This meeting will focus on coping with family stress . We'll provide a safe space to talk about mental health and do some activities!",
    "category": "Wellness",
    "clubId": "activeminds",
    "host": "Active Minds",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12955880",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12964976",
    "title": "General Body Meeting",
    "start": "2026-11-23T19:00:00-05:00",
    "end": "2026-11-23T20:00:00-05:00",
    "location": "Bartlett Hall, Room 61",
    "description": "Join us for our general body meeting!",
    "category": "Wellness",
    "clubId": "activeminds",
    "host": "Active Minds",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12964976",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12797186",
    "title": "Sports Team Meeting",
    "start": "2026-11-17T19:00:00-05:00",
    "end": "2026-11-17T20:00:00-05:00",
    "location": "Integrative Learning Center S413",
    "description": "Weekly meeting for WMUA Sports Team",
    "category": "Media",
    "clubId": "wmuaradiostation",
    "host": "WMUA Radio Station",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12797186",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12785369",
    "title": "WMUA General Body Meeting",
    "start": "2026-12-07T19:00:00-05:00",
    "end": "2026-12-07T20:30:00-05:00",
    "location": "Cape Cod Lounge",
    "description": "General Body Meeting for all members of WMUA!",
    "category": "Media",
    "clubId": "wmuaradiostation",
    "host": "WMUA Radio Station",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12785369",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12964906",
    "title": "Performing Arts Concert",
    "start": "2026-11-20T19:00:00-05:00",
    "end": "2026-11-20T21:00:00-05:00",
    "location": "Marcus Hall room 131",
    "description": "Vocal Suspects hosts some of the talented Performing arts groups from UMass Amherst.",
    "category": "Arts & Music",
    "clubId": "thevocalsuspects",
    "host": "Vocal Suspects",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12964906",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12454540",
    "title": "Collaboration Event",
    "start": "2026-11-23T18:00:00-05:00",
    "end": "2026-11-23T20:00:00-05:00",
    "location": "Cape Cod Lounge",
    "description": "This event will be a collaboration with another cultural organization to build connections and provide a fun and exciting space for our attendees to play games and win prizes.",
    "category": "Cultural",
    "clubId": "koreanstudentsassociation",
    "host": "Korean Students Association",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12454540",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12499796",
    "title": "KDC General Interest Meeting (Spring 2027)",
    "start": "2027-02-04T18:30:00-05:00",
    "end": "2027-02-04T20:00:00-05:00",
    "location": "Cape Cod Lounge",
    "description": "Join us for our General Interest Meeting to meet the eboard, learn about our club's upcoming events and collabs, and discover how you can get involved, all while enjoying fun games and activities.",
    "category": "Arts & Music",
    "clubId": "kpopdanceclub",
    "host": "K-Pop Dance Club",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12499796",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12963485",
    "title": "UMSBC Annual Winter Sale",
    "start": "2026-11-18T12:00:00-05:00",
    "end": "2026-11-18T20:00:00-05:00",
    "location": "Student Union Ballroom",
    "description": "Dreaming of hitting the slopes but need the gear to do it? Join UMSBC for our annual winter sale where we partner with Colorado ski shop in order to bring you crazy discounts on the latest equipment. With prices going as low as 40% off you're not going to want to miss out!",
    "category": "Sports & Recreation",
    "clubId": "skiboardclub",
    "host": "UMass Ski and Board Club",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12963485",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12964458",
    "title": "CKI November GBM: Hygiene Baskets for Craig's Doors",
    "start": "2026-11-17T19:00:00-05:00",
    "end": "2026-11-17T21:00:00-05:00",
    "location": "Bartlett 206",
    "description": "Join us for our November general meeting on Tuesday, November 17th at 7pm, where we'll be assembling hygiene baskets filled with shower and self-care products for Craig's Doors, an organization that supports unhoused members of the local community. Anyone is welcome to join, whether you're a new or returning member!",
    "category": "Service",
    "clubId": "circlekinternationalclub",
    "host": "Circle K International Club of the University of Massachusetts Amherst",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12964458",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12936151",
    "title": "Umass Gaming and Esports - LoL Worlds Final Watch Party",
    "start": "2026-11-14T14:00:00-05:00",
    "end": "2026-11-14T20:00:00-05:00",
    "location": "Campus Center 168",
    "description": "Catch the finals with friends. Big screen, snacks, and a room full of people who care about the result as much as you do. Drop in for the whole game or just the good parts.",
    "category": "Gaming",
    "clubId": "esportsclub",
    "host": "UMass Gaming and Esports Club",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12936151",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12964460",
    "title": "E-Racing Event - Round 5 -Finals",
    "start": "2026-11-18T19:00:00-05:00",
    "end": "2026-11-18T20:00:00-05:00",
    "location": "ILC S240",
    "description": "Step into the driver's seat and feel the rush! 🎮🏎️ Our E-Racing Event is your chance to experience the thrill of virtual racing using a high-end Logitech sim wheel. Out of the top 5, we will have three podium sitters and a winner! Anyone who is not registered for the championship can still come play, or just watch the last race of the championship.",
    "category": "Sports & Recreation",
    "clubId": "formulaoneclub",
    "host": "Formula One Club",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12964460",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12939981",
    "title": "ISBC Cap-and-Trade Game Night",
    "start": "2026-11-19T18:30:00-05:00",
    "end": "2026-11-19T19:30:00-05:00",
    "location": "ISOM 117",
    "description": "At this GBM, we will be doing a cap-and-trade game night, simulating power plants balancing profit and reducing greenhouse gas emissions!",
    "category": "Business",
    "clubId": "isenbergsustainability",
    "host": "Isenberg Sustainability Club",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12939981",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12916446",
    "title": "Networking Night 2026",
    "start": "2026-11-14T10:30:00-05:00",
    "end": "2026-11-14T20:00:00-05:00",
    "location": "Student Union Ballroom",
    "description": "MSA Networking Night aims to strengthen the Muslim student community, provide opportunities for personal and professional growth, and promote a supportive and inclusive environment for Muslim students on campus!",
    "category": "Cultural",
    "clubId": "muslimstudentsassociation",
    "host": "Muslim Students Association",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12916446",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12968328",
    "title": "Carousel of Cultures",
    "start": "2026-11-19T18:00:00-05:00",
    "end": "2026-11-19T20:00:00-05:00",
    "location": "Student Union Ballroom",
    "description": "Come join us for a fun night of food from cultural clubs all over campus! Grab a dish, decorate a flag, or just come to hang out!",
    "category": "Arts & Music",
    "clubId": "universityprogrammingcouncil",
    "host": "University Programming Council",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12968328",
      "retrievedOn": "2026-11-13"
    }
  },
  {
    "id": "cp-12965889",
    "title": "Toast! Improv Newb Show",
    "start": "2026-11-20T20:00:00-05:00",
    "end": "2026-11-20T21:00:00-05:00",
    "location": "Herter Hall room 227",
    "description": "Join Toast! Improv to celebrate our newbs!",
    "category": "Arts & Music",
    "clubId": "comedyleague",
    "host": "Comedy League",
    "verified": {
      "url": "https://umassamherst.campuslabs.com/engage/event/12965889",
      "retrievedOn": "2026-11-13"
    }
  }
];

export const VERIFIED_EVENTS: CampusEvent[] = RAW.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
