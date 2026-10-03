# Wipe Clock

```
git clone https://github.com/Rezarys/extracttools && open extracttools/docs/index.html
```

Or use it online: https://rezarys.github.io/extracttools/

An unofficial calculator for WARDOGS players: enter the XP you have, the XP you need and how much you play, and see whether your next unlock fits before the Season 2 wipe that players report for October 15, 2026, and how many hours a day it would take if not.

It also has:

- a page on what players report the wipe resets, with sources, and what is not confirmed;
- a squad board that lives entirely in a link: post your region, play time and style, share the link, no account;
- ten short answers to the questions players ask most in their Steam reviews.

Everything runs in your browser. Nothing you type is sent anywhere or stored on a server, and the pages load nothing from other sites.

## Where the numbers come from

The calculator uses your own numbers. Its two defaults (5,000 XP and about 60 minutes per match) each come from a single Steam review linked on the page, and are marked as reported by a player, not official. No game data or API is used. The pace mode assumes the same pace to the end; later levels usually take longer.

## Not affiliated

Unofficial fan tool. Not affiliated with, endorsed by or connected to BULKHEAD, Team17 or Valve. WARDOGS is a game by BULKHEAD, published by Team17. No logo or game art is used.

## Tests

```
npm test
```

Unit tests for the calculator and the squad board, checks on every page (unofficial notice, no outside requests, working links, sources for every reported number), and one end to end run in headless Chrome.

Built with AI assistance, tested with automated tests, not reviewed line by line.

Wrong number, or a change after a patch? Open an [issue](https://github.com/Rezarys/extracttools/issues).

## License

MIT, Younes Z.
