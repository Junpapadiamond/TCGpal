# One Piece buy-accuracy sample — 2026-08-14

Target http://localhost:3000. Cards 13. Buyer context: Near Mint, ZIP 10001, English.

Open each URL and set `verdict`:

- `correct` — live listing, and it is the confirmed print.
- `wrong-print` — sibling artwork, wrong number, or wrong language.
- `dead-link` — 404, ended, or redirected to search.
- `unclear` — cannot tell from the page. Counts against accuracy.

`lens` says how the link was presented: `best_value` is a recommendation, `inspect_first` is a
row the product asked the buyer to check. Both are links a buyer clicks, so both are scored.

Rows already carrying `abstained`, `unresolved`, `error` need no review; they have no link to open.

| card | verdict | lens | confirmed | printMatch | total | title | url | notes |
|---|---|---|---|---|---|---|---|---|
| op-nami-op01-016 | wrong-print | inspect_first | OP01-016 | unknown | $3.25 | One Piece TCG English OP01-016 Nami R | https://www.ebay.com/itm/287519615964?amdata=enc%3AAQALAAAAoGfYFPkwiKCW4ZNSs2u11xBcFqka%2BjggCVmUV0O4edsU%2FoUIED%2F%2BT9P3gLacV%2B2suWs7Pe0S4XTU8KZ526SvX3B0lccCRrzkx%2FWQCwTKHOuz3ggPyvoFBQTWzcnEJE7p6A%2BQjIAaZPk5s42IN7BkwUbMP%2FSzDm64HFLJzmjDt14JnnjOWamZ%2BrIZIO9v2jz1%2BgN1HdEUm0Dh6V8a57Q9wWk%3D | Photo is the forest/staff artwork = OP01-016_p3 (The Three Captains). Title says only 'OP01-016 Nami R' and the eBay Set aspect says 'OP-01 Romance Dawn'; no text signal exists. |
| op-zoro-op06-118 | correct | inspect_first | OP06-118 | unknown | $11.50 | Roronoa Zoro OP06-118 Secret Rare Wings of the Captain One Piece Foil Near Mint | https://www.ebay.com/itm/358914570639 | Artwork matches the OP06-118 base secret rare. |
| op-luffy-op05-119 | correct | inspect_first | OP05-119 | unknown | $18.47 | One Piece CCG Monkey.D.Luffy Secret Rare Card OP05-119 OG English | https://www.ebay.com/itm/178404670637 | Artwork matches the OP05-119 base Gear 5 secret rare. |
| op-luffy-st01-001 | wrong-print | best_value | ST01-001 | compatible | $84.99 | 2022 One Piece Monkey.D.Luffy ST01-001 EN Leader | https://www.ebay.com/itm/318572776492 | Nor Con convention foil parallel at $79.99 against a ~$2 base leader. Set aspect, power and card number all read correct; only the foil treatment in the photo gives it away. |
| op-zoro-op01-001 | correct | inspect_first | OP01-001 | unknown | $21.00 | Roronoa Zoro (001) - Romance Dawn Leader  OP01-001 One Piece Card English | https://www.ebay.com/itm/137602979749 | Artwork matches the OP01-001 base leader. |
| op-ace-op02-013-p1 | wrong-print | best_value | OP02-013_p1 | compatible | $308.45 | Bandai One Piece Portgas.D.Ace Alt Art Foil SR Paramount War OP02-013 EN | https://www.ebay.com/itm/227465362031 | Photo shows 'SP OP02-013' = OP02-013_p3 (Special Art, Two Legends). Title and Set aspect both claim the Paramount War alt art; cost 7 / power 7000 agree because every print of the number shares them. |
| op-law-op05-069 | correct | inspect_first | OP05-069 | unknown | $3.35 | Trafalgar Law OP05-069 SR One Piece TCG Awakening The New Era English | https://www.ebay.com/itm/158026644804?amdata=enc%3AAQALAAAAoGfYFPkwiKCW4ZNSs2u11xCxofj4ir%2Bt8hAwgZJMJZPxOyeOwcgMNxC68FlHM8stAvYcCiO7LBPy7NoPBl2s79uveNQdPps1MNyH1EPPcE3yG31GHiF%2BSVJKGrjIcFzzy2PWDtDxn0W%2BurXLHD%2BWCZ6WVSByZqUzWSej8DBuhBI%2FFyt2M1Hfbs3512Ahzn8dib6Zg5CA0BihIW2t0d%2F0Ekc%3D | Artwork matches the OP05-069 base super rare. |
| op-shanks-op09-001 | correct | inspect_first | OP09-001 | unknown | $1.77 | Shanks (001) OP09-001 NM One Piece | https://www.ebay.com/itm/377374661087 | Artwork matches the OP09-001 base leader. Was an abstention before the cache fix, and a promo row before the release veto. |
| op-rosinante-op04-119 | wrong-print | inspect_first | OP04-119 | unknown | $4.99 | Donquixote Rosinante OP04-119 Kingdoms of Intrigue NM One Piece Card TCG | https://www.ebay.com/itm/366387985845?amdata=enc%3AAQALAAAAoGfYFPkwiKCW4ZNSs2u11xBJMzg1W2qTBPLiZRBv%2BmQYFd8JZU6ctYnIpfoQm4aywPs%2Fzu3xZxVyKC5j7HrxwPWeuo32KJOy9j%2Fbm3LFSQi0e1bpEXEwm%2Bj8ul5h8gwvRtgAaaTTq%2B2Q7xEmhj%2F2Kta27WV%2FUmes6MwkckUA0lYmuRvOYsgCYxEgnnJ%2B%2F1bbCCpGGgWf0xcm2MBIGACw11w%3D | Photo is the Japanese OP04-119. The seller declares 'Language: English' and 'Country of Origin: USA' in the item specifics, so no text gate can catch it. |
| op-ace-op07-119-p1 | correct | best_value | OP07-119_p1 | compatible | $24.98 | Portgas.D.Ace (Parallel) OP07-119 500 Years in the Future - Alt Art NM Foil | https://www.ebay.com/itm/366264405086?amdata=enc%3AAQALAAAAoGfYFPkwiKCW4ZNSs2u11xDJTDHetazl2PBDEMB%2BjrYg7wNDdBzfFgTsldzT359Zb%2BxCNvvcesyH%2BBA%2FcxLngu2mCvfhcrFgoqFuJUXT7M3bidv6cgg5ZA5wy9xKh%2Bjk%2BKct6fce3mLuhshCHFCTQfNTlU0Ab4gDorKjUmhSkLgf1wHY%2Fyps1A9ClRU%2BAXlU94kTeBxDdHMUEZQEZ4EDGdc%3D | Artwork matches OP07-119_p1 (cost 10, 10000). The previous winner pictured OP16-118 and was removed by the stated-stat gate. |
| op-chopper-eb01-006 | correct | inspect_first | EB01-006 | unknown | $47.99 | Tony Tony.Chopper EB01-006 Extra Booster: Memorial Collection One Piece Foil NM | https://www.ebay.com/itm/377345744866 | Artwork matches the EB01-006 base super rare. |
| op-linlin-op03-114 | correct | inspect_first | OP03-114 | unknown | $2.99 | Charlotte Linlin (114) OP03-114 Super Rare Pillars of Strength One Piece Foil NM | https://www.ebay.com/itm/336687185553?amdata=enc%3AAQALAAAAoGfYFPkwiKCW4ZNSs2u11xAC3XL8lHI1%2BeX9jN4PLkskokS60CJRIEQkCUR6Sok8Vp8RvSHU2Q3f1O%2Bf2V03DDhAHUqqx9CMUfkwXZ1MdlyyPPXrzBdi1644AHJIzgjHl9ecdsMM8y7OyutxJKYDobYDnzV5vYtSV8DdrvApLGjN7jtq%2B2%2F41YTZ%2FcrYjg9BH%2FbahPNaSiM%2FXG%2BAg1QM3B8%3D | Artwork matches the OP03-114 base super rare. |
| op-ace-op07-053-p1 | correct | best_value | OP07-053_p1 | compatible | $12.09 | Portgas.D.Ace (Tournament Pack 2024 Oct.-Dec.) OP07-053 R NM  | https://www.ebay.com/itm/277966590916?amdata=enc%3AAQALAAAAoGfYFPkwiKCW4ZNSs2u11xD8w9p2Z4tg1qNRoyQ8ApUrVdRzAXm1o9CHumtg3QHnmUBwlR8%2BfrseUpE3aJcwcR0MI2piZbeteTF%2FMKn4arFe0NCudwqRNOkokCZDcXLLc3Q%2B%2B3ALL%2FQnlPIGgNfm%2FClP83EukFr51ogqbj5UxIvAmYI1voWalYue1R7U7xZBAt3EnR2VnCaUtFWTGkIszfA%3D | Competition print. Title names the Tournament Pack 2024 Oct.-Dec. release and the photo is that print; $2.89 from a 23K-sale seller. |
