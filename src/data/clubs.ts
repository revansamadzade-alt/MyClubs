import type { Category, Club } from '../types';

export const CATEGORIES: Category[] = [
  'Technology',
  'Engineering',
  'Business',
  'Academic',
  'Arts & Music',
  'Sports & Recreation',
  'Cultural',
  'Service',
  'Career',
  'Gaming',
  'Media',
  'Wellness',
];

/**
 * Real UMass Amherst student organizations. Names, summaries, descriptions, council tags and
 * links come from each organization's public Campus Pulse listing (retrieved 2026-11-13).
 * Meetings are included only when the listing states the day, start time and end time.
 * Category, initials, color and cover art are MyClubs display choices.
 */
export const CLUBS: Club[] = [
  {
    "id": "googledeveloperclub",
    "name": "Google Developer Student Club",
    "initials": "GD",
    "category": "Technology",
    "tags": [
      "Academic Council"
    ],
    "summary": "The Google Developer Student Club (GDSC) connects students passionate about tech. We offer workshops, hackathons, and mentorship on Google technologies, helping members develop skills, collaborate on projects, and network with industry professionals.",
    "about": "The Google Developer Student Club (GDSC) is a global community of university students who are passionate about technology and eager to learn, collaborate, and grow in the tech field. The club provides a platform for students to enhance their skills in areas such as mobile and web development, cloud computing, machine learning, and more.",
    "meetings": [],
    "color": "#1e4f8f",
    "cover": "circuit",
    "links": [
      {
        "label": "Website",
        "url": "https://gdg.community.dev/gdg-on-campus-university-of-massachusetts-amherst-united-states/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/gdsc.umass/"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/googledeveloperclub",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "womenincybersecurity",
    "name": "Women in Cybersecurity at UMass Amherst",
    "initials": "WC",
    "category": "Technology",
    "tags": [
      "Academic Council"
    ],
    "summary": "We are the Women in Cybersecurity chapter of UMass Amherst. We strive to recruit, retain, and advance women in cybersecurity as a part of a workforce solution. We meet weekly, and are always looking for new members!",
    "about": "We are the Women in Cybersecurity chapter of UMass Amherst. We strive to recruit, retain, and advance women in cybersecurity as a part of a workforce solution. We meet weekly, and are always looking for new members!",
    "meetings": [],
    "scheduleNote": "Meets weekly (day and time not listed).",
    "color": "#5a3a8a",
    "cover": "dots",
    "links": [
      {
        "label": "Website",
        "url": "https://linktr.ee/wicysumass"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/wicysumass/"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/womenincybersecurity",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "roboticsclub",
    "name": "UMass Robotics Club",
    "initials": "RC",
    "category": "Engineering",
    "tags": [
      "Academic Council"
    ],
    "summary": "The UMass Robotics Club is dedicated to giving all students, regardless of major or skill level, a space to learn about robotics. See the full description on our RSO page for more information!",
    "about": "The UMass Robotics Club is a welcoming space for all students—no matter their major or experience level—to explore the world of robotics. Our projects are hands-on and cross-disciplinary, giving members opportunities to dive into mechanical design, software development, electronics, and artistic avenues that go into building robots.",
    "meetings": [],
    "color": "#335c81",
    "cover": "grid",
    "links": [
      {
        "label": "Website",
        "url": "https://discord.gg/dqSUyxUDCH"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/umass.robotics.club?igsh=MWp4NjgxcWZ2bjc1Zw=="
      },
      {
        "label": "LinkedIn",
        "url": "https://www.linkedin.com/company/umassrobotics/"
      },
      {
        "label": "Google Calendar",
        "url": "https://calendar.google.com/calendar/embed?src=umassroboticsclub%40gmail.com&ctz=America%2FNew_York"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/roboticsclub",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "engineerswithoutborders",
    "name": "Engineers Without Borders",
    "initials": "EW",
    "category": "Engineering",
    "tags": [
      "Service & Engagement Council"
    ],
    "summary": "Engineers Without Borders is a student organization dedicated to helping local and international communities create sustainable solutions in order to improve their quality of life.",
    "about": "Engineers Without Borders is a student organization dedicated to helping local and international communities create sustainable solutions in order to improve their quality of life.",
    "meetings": [],
    "color": "#00756a",
    "cover": "topo",
    "links": [
      {
        "label": "Website",
        "url": "http://ewbumass.weebly.com/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/ewb.umass?stkn=MWh4ZG14djllZGR1aw=="
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/engineerswithoutborders",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "3dprinting",
    "name": "3D Printing Club",
    "initials": "3D",
    "category": "Engineering",
    "tags": [
      "Academic Council"
    ],
    "summary": "3D Printing Club is a diverse group of enthusiasts seeking to explore the world of 3D printing. We seek to build 3D printers, experiment with printing materials, and delve into the world of 3D design!",
    "about": "Join our Discord for up-to-date information: https://discord.gg/vYD8hc8bKS ! 3D Printing Club is a diverse group of enthusiasts seeking to explore the world of 3D printing. We seek to build 3D printers, experiment with printing materials, and delve into the world of 3D design! 3D printing is used in art, entertainment, manufacturing, and more. We want to foster a welcoming community where members can connect, brainstorm, and explore this wonderful technology.",
    "meetings": [],
    "color": "#2b3a55",
    "cover": "grid",
    "links": [],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/3dprinting",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "isenberginvestmentclub",
    "name": "Isenberg Investment Club",
    "initials": "IC",
    "category": "Business",
    "tags": [
      "Academic Council"
    ],
    "summary": "The UMass Investment Club seeks to teach undergraduate students skills relating to investment research. Our goal is to aid students in technical financial knowledge so they can be competitive applicants for Wall Street careers. Join our mailing list!",
    "about": "The UMass Investment Club seeks to teach undergraduate students skills relating to investment research. Our goal is to aid students in technical financial knowledge so they can be competitive applicants for Wall Street careers. Join our mailing list!",
    "meetings": [],
    "color": "#1d4f91",
    "cover": "waves",
    "links": [
      {
        "label": "Website",
        "url": "https://umassinvestment.wixsite.com/umassinvestmentclub"
      },
      {
        "label": "LinkedIn",
        "url": "https://www.linkedin.com/company/umass-investment-club/"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/isenberginvestmentclub",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "180consulting",
    "name": "180 Degrees Consulting",
    "initials": "18",
    "category": "Business",
    "tags": [
      "Academic Council"
    ],
    "summary": "180 Degrees Consulting is a student-run consulting group for non-profits and social enterprises.",
    "about": "The mission of 180 Degrees Consulting Amherst is to provide high-quality consulting services to nonprofits, social enterprises, and mission-driven organizations in order to create meaningful social impact while developing students into skilled, ethical, and professional leaders. Deliver practical and measurable value to clients serving the public good. Develop members’ consulting, leadership, communication, and problem-solving skills. Foster a culture of professionalism, accountability, collaboration, and service.",
    "meetings": [],
    "color": "#127a7a",
    "cover": "dots",
    "links": [
      {
        "label": "Website",
        "url": "https://180dcumass.framer.website/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/180dcumass/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/180UMass/"
      },
      {
        "label": "LinkedIn",
        "url": "https://www.linkedin.com/company/180-degrees-consulting-umass-amherst"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/180consulting",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "umassaccountingassociation",
    "name": "Accounting Association",
    "initials": "AA",
    "category": "Business",
    "tags": [
      "Academic Council"
    ],
    "summary": "The UMass Accounting Association is a Registered Student Organization at the University of Massachusetts Amherst. Our goal is to give interested students information and resources to prepare for a successful career in the accounting industry.",
    "about": "Our goal is to give students the tools, information, and resources required to prepare for a successful career. All majors are welcomed and encouraged to come and learn more about the industry. We have weekly meetings that run from 6:00 PM to 7:00 PM on Wednesdays in Isenberg 106. To get on our mailing list please email us accountingassociasion.umass@gmail.com :)",
    "meetings": [
      {
        "dow": 3,
        "start": "18:00",
        "end": "19:00",
        "label": "Weekly meeting"
      }
    ],
    "scheduleNote": "Weekly meetings on Wednesdays, 6:00–7:00 PM in Isenberg 106 (as stated on Campus Pulse).",
    "location": "Isenberg 106",
    "color": "#394b58",
    "cover": "solid",
    "links": [
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/UMassAccountingAssociation/"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/umassaccountingassociation",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "thevocalsuspects",
    "name": "Vocal Suspects",
    "initials": "VS",
    "category": "Arts & Music",
    "tags": [
      "Arts & Media Council"
    ],
    "summary": "Founded in 1999, the Vocal Suspects is the University of Massachusetts' oldest co-ed a cappella group. We entertain the Amherst community with an eclectic mix of contemporary songs, on and off-campus.",
    "about": "Founded in 1999, the Vocal Suspects is the University of Massachusetts' oldest co-ed a cappella group. We entertain the Amherst community with an eclectic mix of contemporary songs, on and off-campus.",
    "meetings": [],
    "color": "#a3324a",
    "cover": "waves",
    "links": [
      {
        "label": "Website",
        "url": "http://sites.google.com/view/vocalsuspects"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/vocalsuspects/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/vocalsuspects"
      },
      {
        "label": "YouTube",
        "url": "https://www.youtube.com/user/thevocalsuspects"
      },
      {
        "label": "X (Twitter)",
        "url": "https://twitter.com/#!/Vocal_suspects"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/thevocalsuspects",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "umasstheatreguild",
    "name": "UMass Theatre Guild",
    "initials": "TG",
    "category": "Arts & Music",
    "tags": [
      "Arts & Media Council"
    ],
    "summary": "The UMass Theatre Guild is UMass' first student-run theatre organization. Each semester we produce a play and a musical with numerous opportunities both onstage and off.",
    "about": "We, the UMass Theatre Guild , are a volunteer organization run through the University of Massachusetts Amherst. ​​ For over 100 years , we have made it our aim to provide a practical learning environment committed to facilitating completely student-run , theater-oriented experiences for UMass (and Five-College) students and community members. ​In fact, we are UMass Amherst's Oldest-surviving RSO (Registered Student Organization), founded in the year 1906!",
    "meetings": [],
    "color": "#7a3e9d",
    "cover": "forest",
    "links": [
      {
        "label": "Website",
        "url": "https://umasstheatreguild.weebly.com/"
      },
      {
        "label": "Instagram",
        "url": "http://instagram.com/umtheatreguild"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/umasstheatreguild/"
      },
      {
        "label": "YouTube",
        "url": "https://youtube.com/@umtheatreguild?si=aHWD5XUOS64rC6rm"
      },
      {
        "label": "X (Twitter)",
        "url": "http://twitter.com/UMTG"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/umasstheatreguild",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "kpopdanceclub",
    "name": "K-Pop Dance Club",
    "initials": "KD",
    "category": "Arts & Music",
    "tags": [
      "Arts & Media Council"
    ],
    "summary": "Step into KDC, where individuals with a common love for K-pop and dance come together. Whether you find joy in perfecting dance routines or enjoy talking about your favorite members, our club is tailored to suit your interests!",
    "about": "Welcome to KDC &ndash; your ultimate destination for uniting individuals who share a passion for K-pop and dance. Whether you're thrilled by mastering choreography for enjoyment or simply adore discussing your bias, our club caters perfectly to you!",
    "meetings": [],
    "color": "#b8172b",
    "cover": "waves",
    "links": [
      {
        "label": "Website",
        "url": "https://beacons.ai/kdcamherst"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/kdcamherst/"
      },
      {
        "label": "YouTube",
        "url": "https://www.youtube.com/@KDCAmherst"
      },
      {
        "label": "Google Calendar",
        "url": "https://calendar.google.com/calendar/u/0?cid=a2RjYW1oZXJzdEBnbWFpbC5jb20"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/kpopdanceclub",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "umoc",
    "name": "Outing Club",
    "initials": "OC",
    "category": "Sports & Recreation",
    "tags": [
      "Recreation Council"
    ],
    "summary": "The UMass Outing Club is the largest Registered Student Organization on campus, with a Hundred Years of History. Its active membership includes undergraduates, graduate students, faculty, and alumni.",
    "about": "The UMass Outing Club is the largest Registered Student Organization on campus, with a Hundred Years of History. Its active membership includes undergraduates, graduate students, faculty, and alumni.",
    "meetings": [],
    "scheduleNote": "General meetings Mondays at 6:00 PM outside the gear locker, 472 North Pleasant Street. No end time is listed, so it is not added to your calendar.",
    "location": "Outside the gear locker, 472 North Pleasant Street",
    "color": "#2f6f4f",
    "cover": "topo",
    "links": [
      {
        "label": "Website",
        "url": "http://umoc.teamapp.com"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/umassoutingclub/"
      },
      {
        "label": "Facebook",
        "url": "http://www.facebook.com/pages/UMass-Outing-Club/162160992931"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/umoc",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "ladyzooultimate",
    "name": "Ultimate Frisbee - Women's",
    "initials": "WU",
    "category": "Sports & Recreation",
    "tags": [
      "Club Sport Council"
    ],
    "summary": "Welcome to the home of UMass Women's Ultimate Frisbee! We practice throughout the year and travel to tournaments around the Northeast and beyond. We work hard to continue to be a competitive team while having fun.",
    "about": "The UMass Women's Ultimate team is an RSO dedicated to building friendships, competing at a high level, and promoting UMass and the sport of ultimate. We practice during the fall and spring semesters and travel to tournaments around the Northeast and beyond. Practices consist of drills, throwing, scrimmaging and conditioning. We work hard to continue to be a competitive team while having fun.",
    "meetings": [],
    "scheduleNote": "Practices during the fall and spring semesters (times not listed).",
    "color": "#4b5d16",
    "cover": "grid",
    "links": [
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/zoola.ultimate/?hl=en"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/ladyzooultimate",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "chessclub",
    "name": "Chess Club",
    "initials": "CC",
    "category": "Sports & Recreation",
    "tags": [
      "Recreation Council"
    ],
    "summary": "UMass Chess Club Meets Mondays and Thursdays from 6:00PM to 9:00PM at the Blue Wall. Free to join/play, players of all skill levels welcome(including beginners/people who don't know how to play!)",
    "about": "The UMASS Chess club is your stop for any chess endeavors! We provide a social network in person and online through which you can meet players of your skill level to practice and improve together.",
    "meetings": [
      {
        "dow": 1,
        "start": "18:00",
        "end": "21:00",
        "label": "Club meeting"
      },
      {
        "dow": 4,
        "start": "18:00",
        "end": "21:00",
        "label": "Club meeting"
      }
    ],
    "scheduleNote": "Mondays and Thursdays, 6:00–9:00 PM at the Blue Wall (as stated on Campus Pulse).",
    "location": "Blue Wall",
    "color": "#6b5b2a",
    "cover": "grid",
    "links": [
      {
        "label": "Website",
        "url": "https://websites.umass.edu/chess-rso/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/umasschessclub/"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/chessclub",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "vietnamesestudentassociation",
    "name": "Vietnamese Students Association",
    "initials": "VA",
    "category": "Cultural",
    "tags": [
      "Cultural Council"
    ],
    "summary": "Vietnamese Students Association is a non-profit organization run by students at UMass Amherst. Our board members work hard to help VSA reflect the richness of our student population and to represent the Vietnamese community at UMass.",
    "about": "Vietnamese Students Association (VSA) is a non-profit organization run by students here at University of Massachusetts, Amherst. To improve the traditional spirit, the Vietnamese Students Association (VSA) was founded with the enthusiasm of Vietnamese students at UMass, Amherst.",
    "meetings": [],
    "color": "#995c00",
    "cover": "topo",
    "links": [
      {
        "label": "Website",
        "url": "http://www.umass.edu/rso/vsa/"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/umavsa/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/umassamherstvsa/"
      },
      {
        "label": "YouTube",
        "url": "https://www.youtube.com/channel/UCSdfN3d37HG79P0b-Q_lnDw"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/vietnamesestudentassociation",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "koreanstudentsassociation",
    "name": "Korean Students Association",
    "initials": "KS",
    "category": "Cultural",
    "tags": [
      "Cultural Council"
    ],
    "summary": "The mission of KSA is to educate the community on all aspects of Korean cultural, political, and social issues. KSA will work to raise awareness of Korean heritage, to support its members, to have outreach to others in the community, and to preserve the…",
    "about": "The mission of KSA is to educate the community on all aspects of Korean cultural, political, and social issues. KSA works to raise awareness of Korean heritage, support its members, outreach other communities, and preserve the Korean identity. The focal point of KSA is to strive for unity amongst Korean-interest groups and solidarity that ultimately expands beyond a mere student association.",
    "meetings": [],
    "color": "#0f6b8f",
    "cover": "dots",
    "links": [
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/umassksa/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/UMass-Korean-Students-Association-330425410626922/?ref=page_internal"
      },
      {
        "label": "YouTube",
        "url": "https://www.youtube.com/channel/UCql71mqbz5L00H_CNIB4TqA"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/koreanstudentsassociation",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "habitatforhumanity",
    "name": "Habitat for Humanity",
    "initials": "HH",
    "category": "Service",
    "tags": [
      "Service & Engagement Council"
    ],
    "summary": "UMass Habitat for Humanity works directly with the Pioneer Valley Chapter of Habitat to help build homes in the local community for people who can not afford them. If you have any specific questions, please feel free to contact habitat-rso@umass.edu.",
    "about": "The University of Massachusetts Amherst Habitat for Humanity Chapter is a student-led, student-initiated organization that seeks to further the goals of Habitat for Humanity International in providing decent, affordable housing for low-income families. Our goals are to advocate for affordable housing, educate people about our organization, raise funds to support local and international volunteering, and build homes in partnership with Habitat homeowners.",
    "meetings": [],
    "color": "#8a4b08",
    "cover": "solid",
    "links": [
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/umasshfh/"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/UMassHFH/?ref=aymt_homepage_panel"
      },
      {
        "label": "X (Twitter)",
        "url": "http://twitter.com/#!/UMASSHFH"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/habitatforhumanity",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "bestbuddies",
    "name": "Best Buddies",
    "initials": "BB",
    "category": "Service",
    "tags": [
      "Service & Engagement Council"
    ],
    "summary": "Best Buddies is a global volunteer movement, working towards a more inclusive environment for individuals with intellectual and developmental disabilities (IDD) through creating opportunities for friendships. Read Full Description before contacting.",
    "about": "To establish a global volunteer movement that creates opportunities for one-to-one friendships, integrated employment and leadership development for people with intellectual and developmental disabilities (IDD). To create long lasting friendships between students with and without intellectual and developmental disabilities and to promote inclusion in all aspects of life!",
    "meetings": [],
    "color": "#a03c78",
    "cover": "waves",
    "links": [
      {
        "label": "Website",
        "url": "http://www.bestbuddiesonline.org"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/umassamherstbestbuddies?igsh=MXhldWpmeHZxMWR2aw%3D%3D&utm_source=qr"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/bestbuddies",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "wmuaradiostation",
    "name": "WMUA Radio Station",
    "initials": "WM",
    "category": "Media",
    "tags": [
      "Student Agency"
    ],
    "summary": "WMUA is the radio voice of UMass Amherst. We are a completely student run organization on campus that provides a view into the world of broadcast. You can DJ your own show, report the news, call sports games, and so much more. Come check us out!",
    "about": "WMUA 91.1 FM is a federally licensed (non-commercial) broadcast facility serving the Connecticut River Valley of Western Massachusetts, Northern Connecticut, and Southern Vermont. Full-time undergraduate students at the University of Massachusetts-Amherst manage WMUA.",
    "meetings": [],
    "color": "#881c1c",
    "cover": "circuit",
    "links": [
      {
        "label": "Website",
        "url": "http://www.wmua.org"
      },
      {
        "label": "Instagram",
        "url": "https://www.instagram.com/wmua"
      },
      {
        "label": "Facebook",
        "url": "http://www.facebook.com/wmua91.1"
      },
      {
        "label": "YouTube",
        "url": "https://www.youtube.com/@wmua7107"
      },
      {
        "label": "X (Twitter)",
        "url": "http://twitter.com/wmua"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/wmuaradiostation",
    "verifiedOn": "2026-11-13"
  },
  {
    "id": "activeminds",
    "name": "Active Minds",
    "initials": "AM",
    "category": "Wellness",
    "tags": [
      "Advocacy Council"
    ],
    "summary": "Active Minds strives to change the conversation about mental health by reducing stigma through student participation. In facilitating dialogue and community awareness we hope to show the importance of mental well-being for the individual and community.",
    "about": "Active Minds is a national organization that empowers students to speak openly about mental health in order to educate others and encourage help-seeking. We are changing the culture on campuses and in the community by providing information, leadership opportunities and advocacy training to the next generation.",
    "meetings": [],
    "color": "#2f6f8f",
    "cover": "waves",
    "links": [
      {
        "label": "Instagram",
        "url": "http://www.instagram.com/umassactiveminds"
      },
      {
        "label": "Facebook",
        "url": "https://www.facebook.com/pages/Active-Minds-UMass-Chapter/241144885932992"
      },
      {
        "label": "X (Twitter)",
        "url": "http://twitter.com/amindsumass"
      }
    ],
    "sourceUrl": "https://umassamherst.campuslabs.com/engage/organization/activeminds",
    "verifiedOn": "2026-11-13"
  }
];

export const CLUB_BY_ID: Record<string, Club | undefined> = Object.fromEntries(CLUBS.map((c) => [c.id, c]));
