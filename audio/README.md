# Background music

Drop an audio file named **`ambient.mp3`** in this folder to enable
background music site-wide.

Recommended:
- Format: MP3 or OGG (broad browser support)
- Bitrate: 128–192 kbps (small file, fine quality for ambient)
- Length: 2–5 minutes — the file loops automatically, so a longer track
  feels less repetitive
- Vibe: low-key ambient / drone / lo-fi — anything that doesn't
  compete with the on-screen activity

If the file is missing, the widget in the bottom-right corner appears
with a "no audio file" hint and stays inactive — no JS errors.

## Where to find free / royalty-free tracks

- [Pixabay Music](https://pixabay.com/music/) — no attribution needed
- [Free Music Archive](https://freemusicarchive.org) — filter by CC0
- [Incompetech](https://incompetech.com) by Kevin MacLeod — CC-BY (credit him in your About page)
- [Freesound.org](https://freesound.org) — short loops & textures

## File paths the player tries

Just `audio/ambient.mp3`. If you want to use a different name or format,
edit the `SRC` constant at the top of `js/audio-player.js`.
