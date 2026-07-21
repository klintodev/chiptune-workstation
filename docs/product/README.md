# Product requirements

These documents define a sequence of independently demonstrable features for a browser-based chiptune DAW. They are deliberately ordered so that each completed PRD leaves the product in a usable state.

| PRD | Feature | Delivery tier |
| --- | --- | --- |
| [PRD 1](./01-playable-instrument.md) | Playable instrument | Core |
| [PRD 2](./02-single-track-step-sequencer.md) | Single-track step sequencer | Core |
| [PRD 3](./03-pattern-editing.md) | Pattern editing | Core |
| [PRD 4](./04-scalable-application-foundation.md) | Scalable application foundation | Technical enabler |
| [PRD 5](./05-multi-track-arrangement.md) | Multi-track arrangement | Core |
| [PRD 6](./06-daw-workspace-redesign.md) | DAW workspace redesign | UX enabler |
| [PRD 7](./07-project-persistence.md) | Project persistence | Core |
| [PRD 8](./08-optional-accounts-and-cloud-projects.md) | Optional accounts and cloud projects | Technical enabler |
| [PRD 9](./09-audio-export.md) | Audio export | Extended |
| [PRD 10](./10-reactive-visualiser.md) | Reactive visualiser | Stretch |
| [PRD 11](./11-visualiser-editor.md) | Visualiser editor | Stretch |
| [PRD 12](./12-sharing-and-playback-pages.md) | Sharing and playback pages | Ultimate stretch |
| [PRD 13](./13-email-verification.md) | Email verification | Security enabler |

PRD 4 is the implementation prerequisite for PRD 5. PRD 6 makes the delivered multi-track workflow usable before persistence is added in PRD 7. The local-first release boundary is PRDs 1-7. PRD 8 adds the optional identity and cloud foundation needed for eventual publishing without gating the workstation. PRD 9 adds a portable audio artifact, while PRDs 10-12 add the audiovisual and sharing experiences. PRD 13 hardens optional accounts by requiring verified email ownership before any private cloud access or publication mutation.
