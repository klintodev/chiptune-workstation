# Epic 04 manual test

1. Enable audio and hold a note while selecting each waveform. The held note must immediately change to the selected waveform without requiring another key press.
2. Hold a note while moving down and up through the supported octaves. The held note's pitch and displayed labels must change immediately.
3. Attempt to move beyond the octave limits. The corresponding control must be disabled.
4. Hold a note while sweeping volume from maximum to silence. The level must change smoothly and zero must be silent.
5. Change attack or release without playing a note. No sound should be created. Play a new note to hear the new envelope settings.
6. Set attack near 2 seconds and play a new note; hear a slow fade-in. Set release near 3 seconds, play and release a new note; hear a long fade-out.
7. Change all controls, select **Reset instrument**, and confirm the defaults return without creating sound.
8. Release a computer key after changing waveform through the selector. The note must still stop correctly.