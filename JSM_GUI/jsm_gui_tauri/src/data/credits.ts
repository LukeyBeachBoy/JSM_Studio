// Attribution evidence and scope: docs/CREDITS.md. Keep identities as published upstream.
export type CreditEntry = { id: string; name: string; description: string; url: string }
export type CreditGroup = { id: string; title: string; entries: CreditEntry[] }

export const CREDIT_GROUPS: CreditGroup[] = [
  {
    "id": "people",
    "title": "People behind the project",
    "entries": [
      {
        "id": "jibb",
        "name": "Jibb Smart (Julian “Jibb” Smart)",
        "description": "JoyShockMapper creator; flick stick, gyro controls and the foundations this app builds on.",
        "url": "https://github.com/JibbSmart/JoyShockMapper"
      },
      {
        "id": "nicolas",
        "name": "Nicolas Lessard (Electronicks)",
        "description": "JoyShockMapper lead developer since version 3; mapping features, autoload and continued upstream development.",
        "url": "https://github.com/Electronicks/JoyShockMapper"
      },
      {
        "id": "evan",
        "name": "Evan McLean (evan1mclean)",
        "description": "Creator of JSM Custom Curve, including custom acceleration curves and the GUI this project grew from.",
        "url": "https://github.com/evan1mclean/JSM_custom_curve"
      },
      {
        "id": "hotuns",
        "name": "hotuns",
        "description": "Creator of JSM Studio; the Tauri desktop app, bundled mapper and HidHide integration that preceded JSM Evolved.",
        "url": "https://github.com/hotuns/JSM_Studio"
      },
      {
        "id": "luke",
        "name": "Luke Beach (LukeyBeachBoy)",
        "description": "JSM Evolved development, controller-first editing and Steam Controller integration in this fork.",
        "url": "https://github.com/LukeyBeachBoy/JSM_Studio"
      },
      {
        "id": "ceski",
        "name": "ceski (ceski-1)",
        "description": "Controller support improvements carried through the JSM Custom Curve lineage.",
        "url": "https://github.com/ceski-1/JSM_custom_curve"
      }
    ]
  },
  {
    "id": "contributors",
    "title": "More JoyShockMapper contributors",
    "entries": [
      {
        "id": "portability",
        "name": "Romeo Calota, Robin, TauAkiou and mmmaisel",
        "description": "Linux, portability, controller support, build fixes and error handling acknowledged in upstream documentation and history.",
        "url": "https://github.com/Electronicks/JoyShockMapper#credits"
      },
      {
        "id": "mapping",
        "name": "Garrett and Roy Straver",
        "description": "Code contributions and flick stick options acknowledged by JoyShockMapper.",
        "url": "https://github.com/Electronicks/JoyShockMapper/blob/master/CHANGELOG.md"
      },
      {
        "id": "triggers",
        "name": "John “Nielk1” Klein",
        "description": "Adaptive trigger effect functions used by JoyShockMapper.",
        "url": "https://github.com/Electronicks/JoyShockMapper#107-adaptive-triggers"
      },
      {
        "id": "art",
        "name": "Bryan Rumsey, Contributer and Sunny Ye",
        "description": "Upstream icon art and translation contributions, as credited by JoyShockMapper.",
        "url": "https://github.com/Electronicks/JoyShockMapper#credits"
      }
    ]
  },
  {
    "id": "input",
    "title": "Controller and motion foundations",
    "entries": [
      {
        "id": "sdl",
        "name": "SDL contributors",
        "description": "Controller discovery, input, sensors and device support through the bundled SDL backend.",
        "url": "https://github.com/libsdl-org/SDL"
      },
      {
        "id": "jsl",
        "name": "JoyShockLibrary — Jibb Smart and contributors",
        "description": "The legacy controller backend and an important part of JoyShockMapper’s origins.",
        "url": "https://github.com/JibbSmart/JoyShockLibrary"
      },
      {
        "id": "motion",
        "name": "GamepadMotionHelpers — Jibb Smart and contributors",
        "description": "Gyro sensor fusion and calibration used by the mapper.",
        "url": "https://github.com/JibbSmart/GamepadMotionHelpers"
      },
      {
        "id": "vigem",
        "name": "ViGEmBus / ViGEmClient — nefarius and contributors",
        "description": "Virtual Xbox and DualShock controller output.",
        "url": "https://github.com/nefarius/ViGEmBus"
      },
      {
        "id": "hidhide",
        "name": "HidHide — nefarius and contributors",
        "description": "Physical controller hiding to avoid duplicate game input.",
        "url": "https://github.com/nefarius/HidHide"
      },
      {
        "id": "euro",
        "name": "1€ Filter — Géry Casiez, Nicolas Roussel and Daniel Vogel",
        "description": "The adaptive filtering algorithm used for gyro smoothing.",
        "url": "https://gery.casiez.net/1euro/"
      },
      {
        "id": "enum",
        "name": "magic_enum contributors",
        "description": "Enum reflection in JoyShockMapper, including the jamek fork selected by its build.",
        "url": "https://github.com/Neargye/magic_enum"
      },
      {
        "id": "fsm",
        "name": "pocket_fsm — Electronicks and contributors",
        "description": "State-machine support used by JoyShockMapper’s mapping engine.",
        "url": "https://github.com/Electronicks/pocket_fsm"
      }
    ]
  },
  {
    "id": "interface",
    "title": "Desktop, interface and build tools",
    "entries": [
      {
        "id": "tauri",
        "name": "Tauri and Rust communities",
        "description": "The desktop shell, native integration and Rust ecosystem, including Serde and reqwest.",
        "url": "https://github.com/tauri-apps/tauri"
      },
      {
        "id": "react",
        "name": "React contributors",
        "description": "The component framework behind the editor.",
        "url": "https://github.com/facebook/react"
      },
      {
        "id": "radix",
        "name": "Radix UI contributors",
        "description": "Accessible dialogs, menus, selectors and sliders.",
        "url": "https://github.com/radix-ui/primitives"
      },
      {
        "id": "i18n",
        "name": "i18next / react-i18next contributors",
        "description": "Translation and language support.",
        "url": "https://github.com/i18next/react-i18next"
      },
      {
        "id": "icons",
        "name": "Lucide, Game Icons and Iconify contributors",
        "description": "Icon collections and rendering used by the interface.",
        "url": "https://github.com/iconify/iconify"
      },
      {
        "id": "markdown",
        "name": "react-markdown / unified contributors",
        "description": "Rendering the bundled offline documentation.",
        "url": "https://github.com/remarkjs/react-markdown"
      },
      {
        "id": "geist",
        "name": "Geist fonts — Vercel and contributors",
        "description": "The bundled Geist Sans and Geist Mono typefaces used throughout the app.",
        "url": "https://github.com/vercel/geist-font"
      },
      {
        "id": "tools",
        "name": "Vite, TypeScript, CMake and Catch2 contributors",
        "description": "The tools used to build and validate the app and mapper.",
        "url": "https://github.com/vitejs/vite"
      }
    ]
  },
  {
    "id": "community",
    "title": "The wider community",
    "entries": [
      {
        "id": "community",
        "name": "GyroWiki and the gyro gaming community",
        "description": "Thanks to everyone sharing configurations, testing controllers, reporting bugs, writing guides and helping other players.",
        "url": "http://gyrowiki.jibbsmart.com"
      }
    ]
  }
]
