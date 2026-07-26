# Product requirements

These documents define independently demonstrable roadmap releases for a browser-based chiptune DAW. PRD numbers are stable identifiers, not a strict execution order: user-facing releases leave the product usable, while a cross-cutting technical PRD may be delivered in slices alongside them.

| PRD | Feature | Delivery tier | Implementation | Status |
| --- | --- | --- | --- | --- |
| [PRD 1](./01-playable-instrument.md) | Playable instrument | Core | [PRD01/E01-E05](../epics/prd-01-playable-instrument.md) | Delivered |
| [PRD 2](./02-single-track-step-sequencer.md) | Single-track step sequencer | Core | [PRD02/E06-E09](../epics/prd-02-single-track-step-sequencer.md) | Delivered |
| [PRD 3](./03-pattern-editing.md) | Pattern editing | Core | [PRD03/E10-E14](../epics/prd-03-pattern-editing.md) | Delivered |
| [PRD 4](./04-scalable-application-foundation.md) | Scalable application foundation | Technical enabler | No standalone epic file | Delivered |
| [PRD 5](./05-multi-track-arrangement.md) | Multi-track arrangement | Core | [PRD05/E15-E21](../epics/prd-05-multi-track-arrangement.md) | Delivered |
| [PRD 6](./06-daw-workspace-redesign.md) | DAW workspace redesign | UX enabler | [PRD06/E22-E26](../epics/prd-06-daw-workspace-redesign.md) | Delivered |
| [PRD 7](./07-project-persistence.md) | Project persistence | Core | [PRD07/E21-E25](../epics/prd-07-project-persistence.md) | Delivered |
| [PRD 8](./08-optional-accounts-and-cloud-projects.md) | Optional accounts and cloud projects | Technical enabler | [PRD08/E26-E31](../epics/prd-08-optional-accounts-and-cloud-projects.md) | Delivered |
| [PRD 9](./09-audio-export.md) | Audio export | Extended | [PRD09/E32-E35](../epics/prd-09-audio-export.md) | Delivered |
| [PRD 10](./10-reactive-visualiser.md) | Reactive visualiser | Stretch | [PRD10/E36-E39](../epics/prd-10-reactive-visualiser.md) | Delivered |
| [PRD 11](./11-visualiser-editor.md) | Visualiser editor | Stretch | [PRD11/E40-E43](../epics/prd-11-visualiser-editor.md) | Delivered |
| [PRD 12](./12-sharing-and-playback-pages.md) | Sharing and playback pages | Ultimate stretch | [PRD12/E44-E47](../epics/prd-12-sharing-and-playback-pages.md) | Delivered |
| [PRD 13](./13-email-verification.md) | Email verification | Security enabler | [PRD13/E48-E50](../epics/prd-13-email-verification.md) | Delivered |
| [PRD 20](./20-reliability-and-recovery.md) | Reliability and recovery | Core hardening | [PRD20/E70-E73](../epics/prd-20-reliability-and-recovery.md) | Planned: release blocker |
| [PRD 21](./21-beginner-composition-and-accessible-interaction.md) | Beginner composition and accessible interaction | UX enabler | [PRD21/E74-E78](../epics/prd-21-beginner-composition-and-accessible-interaction.md) | Planned: next |
| [PRD 22](./22-visual-learning-workspace.md) | Visual learning workspace | Extended | [PRD22/E79-E82](../epics/prd-22-visual-learning-workspace.md) | Planned: after PRD 21 |
| [PRD 23](./23-maintainable-application-foundation.md) | Maintainable application foundation | Technical enabler | [PRD23/E83-E86](../epics/prd-23-maintainable-application-foundation.md) | Planned: cross-cutting |
| [PRD 24](./24-guided-creation-and-remixing.md) | Guided creation and remixing | Extended | [PRD24/E87-E90](../epics/prd-24-guided-creation-and-remixing.md) | Planned: later |
| [PRD 25](./25-visualiser-palettes-and-customisation.md) | Visualiser palettes and customisation | Extended | [PRD25/E91-E94](../epics/prd-25-visualiser-palettes-and-customisation.md) | In progress: palette presets |

PRD 4 is the implementation prerequisite for PRD 5. PRD 6 makes the delivered multi-track workflow usable before persistence is added in PRD 7. The local-first release boundary is PRDs 1-7. PRD 8 adds the optional identity and cloud foundation needed for eventual publishing without gating the workstation. PRD 9 adds a portable audio artifact, while PRDs 10-12 add the audiovisual and sharing experiences. PRD 13 hardens optional accounts by requiring verified email ownership before any private cloud access or publication mutation.

PRDs 14-19 were delivered as implementation-led epic documents without parallel product files. Numbering resumes at PRD 20 so new product requirements and implementation epics remain aligned.

PRD 20 is the next release boundary because it fixes data-loss and audio-failure paths before the product grows. PRD 21 makes the first composition workflow understandable and operable across pointer, keyboard, assistive technology, and narrow screens. PRD 22 builds a visual learning layer on the deterministic projection introduced by PRD 16. PRD 23 is a cross-cutting workstream that supplies clearer module boundaries and browser-level quality gates alongside those releases. PRD 24 follows the beginner and visual foundations with guided musical creation, remixing, and lightweight checkpoint history.

PRD 25 extends the visual-learning workspace with project-owned visual identity. Its first three epics add curated palettes and consistent public playback; its custom-colour editor remains a separate later iteration.

Recommended delivery order:

1. Complete PRD20/E70-E73 before expanding project state, cloud behaviour, or creation features.
2. Begin PRD23/E83 and the baseline parts of E86, then deliver required beginner work PRD21/E74-E77 against those seams where practical; PRD21/E78 remains optional.
3. Deliver PRD22/E79-E82 after PRD 21 establishes the visible workspace navigation, input rules, reduced-motion policy, and responsive baseline it reuses.
4. Complete PRD23/E84-E85 and promote the full suite through E86 before increasing project complexity.
5. Treat PRD 24's epics as independently reviewable later releases in the order E87, E90, E88, then E89 so scale and checkpoint foundations precede their consumers.
6. Deliver PRD25/E91-E93 as one palette-preset slice, observe how people use the curated roles, then design E94's bounded custom editor from that evidence.
