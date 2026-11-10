# Character Library Tag Filter

A Marinara Engine External Extension with two parts:

- A **Character Manager** window, modelled on SillyTavern's [AnotherCharManager](https://github.com/sakhavhyand/SillyTavern-AnotherCharManager). It searches and sorts the whole library in the browser, so any mix of tag filters and text search covers every character at once.
- **Tag filters** inside Marinara's full Character Library (**Open Library**).

## Character Manager

Open it by **right-clicking the Characters button in the top bar** or **the Open Library button** in the Characters panel (left clicks keep Marinara's behavior), or with the grid button next to the tag filter button in the full library. Esc or the × closes it, and your search, filters and selection are still there when you reopen it.

**Searching**

- **Search box** with a scope menu: *Name, creator & tags* (default), *Name*, *Creator*, *Tags*, or *All card text*. Every word must match. `"two words"` matches a phrase and `-word` excludes it. *All card text* uses Marinara's own catalog search, so it also reads descriptions, first messages, scenarios and creator notes. The × at the right end clears the box; Ctrl+Z right after puts the text back.
- **Tag rows**: *Mandatory tags* (must have all), *At least one tag* (must have one of them) and *Excluded tags* (must have none). They combine with each other and with the search box. Suggestions show how many characters in the current results have each tag, out of the whole library.
- **Tag syntax in the search box**: `#tag` or `tag:"two words"` is mandatory, `-#tag` is excluded, `~tag` (or `any:tag`) is at least one, and `creator:name` filters by creator. A finished tag token turns into a chip in the matching row. Typing `#` shows tag suggestions.
- **More filters** (sliders button): tag count range, token range, date added range, untagged only, and favorites (star button).
- **Folders**: the folder menu in the toolbar shows one of Marinara's folders, characters in no folder, or characters in any folder. `folder:name` and `-folder:name` work in the search box. Cards in a folder show a folder icon (hover for the names).
- **Saved searches**: the menu next to the search box saves the current search, tag rows, filters and sort under a name, loads it again, or deletes it. They are kept in the extension's storage.
- **Tag cloud** (# button): the most common tags in the current results. Click a tag to require it, Shift-click to add it to *At least one*, and Alt-click or right-click to exclude it. The same works on tags in the details pane.
- **Tag Merger**: with Tag Merger 0.1.1 or later running, *Canonical tags only* limits suggestions, the cloud and the details pane to canonical tags. *Match variant spellings* matches through Tag Merger's dictionary, so `Elf` also finds `elves` and anything that implies Elf.

**Browsing**

- Sort by name, tag count, date added, last updated, token estimate, creator, favorites first, or random (with a reshuffle button). The dice button picks a random character from the results.
- The card grid only renders what is on screen, so large libraries scroll smoothly. The slider sets the card size.
- Arrow keys, Page Up/Down, Home and End move the selection when the grid has focus, and `/` jumps to the search box.
- The details pane shows the avatar, creator (click to list everything by them), version, dates, token estimate and tags, plus the description, first message, scenario, personality, creator notes and alternate greetings, loaded when you select the character.

**Actions**

- **Edit** (or double-click or Enter) opens Marinara's full-screen character editor. **Chat** opens Marinara's start-chat dialog. A notice then offers to go back to the manager.
- **Favorite** toggles the favorite flag.
- Add a tag with the *+ tag* field and remove one with its ×. Both offer Undo.
- **Selecting several characters**: Ctrl-click (Cmd on Mac) or the checkbox on a card adds it to the selection, Shift-click selects a range, and Ctrl+A in the grid selects every result. Once something is selected, a plain click anywhere on a card adds it or takes it out. A bar then lets you add or remove a tag on just the selection, add it to a folder, take it out of one, or make a new folder from it. Esc clears the selection.
- **Folders in the details pane**: the character's folders are listed under its tags. Click one to show that folder, use × to take the character out, or *+ folder* to add it to one.
- **Download link**: when a card records where it came from, the details pane shows *Open on Chub* (or Botbooru, JannyAI, Pygmalion, Wyvern, DataCat, or the site's name) with a copy button. Sources, in order: Char Importer's `extensions.char_importer.source_url`, `extensions.botbooru.post_id`, Marinara's Bot Browser `extensions.botBrowserSource`, Chub's `extensions.chub.full_path`, `extensions.source_url`, and the card's own V3 `source` list. Botbooru download links are shown as the character page. Cards with none of these show *No download link saved*.
- **Deleting**: *Delete* in the details pane or in the selection bar deletes characters permanently. Marinara has no trash and this cannot be undone. A dialog in the manager lists the characters first (Esc or Cancel backs out), and for 10 or more the Delete button stays off until you type how many. Two deletes run at once, at most 5 a second, so a big delete stays well inside Marinara's shared limit of 600 API requests a minute and its own UI keeps working. If Marinara still answers "too many requests", the run waits as long as it asks and retries. A dropped connection or server error is retried up to three times (if the first try did delete the card, the retry finds it gone and counts it as deleted). The progress notice shows the count and a running clock; *Stop* lets the deletes in flight finish and starts no more. If some still fail, the final notice has a *Retry* button for just those. Marinara also takes the characters out of their chats and deletes their gallery images; the chats themselves stay. Professor Mari is built in and is skipped.
- **All results** (under More filters) adds or removes one tag on every character in the current results, after a confirmation. Marinara saves a version of each card before its tags change.

## Tag filters in the full library

A tag button next to the library toolbar expands three fields:

- **Mandatory tags**: shows only characters that have every one of the chosen tags.
- **At least one tag**: shows only characters that have any of the chosen tags.
- **Excluded tags**: hides characters that have any of the chosen tags.

The rows combine: a character is shown when it has all mandatory tags, at least one of the "at least one" tags (if any are set), and none of the excluded tags.

Type in either field to get tag suggestions with character counts. Add a tag by clicking it or pressing Enter, and move through suggestions with the arrow keys. Backspace in an empty field removes the last tag.

<img width="1931" height="380" alt="image" src="https://github.com/user-attachments/assets/d693c5e6-ee00-4e87-978f-c2315791a872" />

<img width="947" height="403" alt="image" src="https://github.com/user-attachments/assets/5d6bebc6-6815-462b-b36b-f0f5d9affc89" />



### How the library filters work

- **Mandatory tags** are written into the library search box as `"Tag"` terms. Marinara treats every search term as a tag the character must have and filters on the server, so this covers characters that aren't loaded yet. Quoting keeps multi-word tags together.
- **Excluded tags** are written into the search box as `-tag:"Tag"`, which is Marinara's own exclusion syntax.
- Both stay in sync with the search box. Typing `"X"` or `-tag:"X"` by hand adds a chip, and deleting the token removes the chip.
- **At least one tag** hides non-matching cards with an injected stylesheet, because Marinara's search has no any-of tag filter. The tag data comes from `GET /api/characters/catalog?view=summary`.
- Filters reset every time the library opens, like Marinara's search box.
- The persona library is left alone.

## How the manager works

- One request, `GET /api/characters/catalog?view=summary`, returns every character's name, creator, tags, dates, token estimate and avatar. The manager indexes it once and filters and sorts in the browser, so a keystroke is one pass over the index (about 3 ms for 20,000 characters).
- Each time the manager opens, `catalogGeneration` is checked and the library is reloaded only if it changed. The refresh button forces a check.
- *All card text* sends one `catalog?view=summary&search=…` request per word and intersects the results with the local filters.
- Tag edits use `POST /api/characters/bulk-tags` and favorites use `PATCH /api/characters/:id`, the same endpoints Marinara uses.
- Deleting uses `DELETE /api/characters/:id` (there is no bulk delete). Marinara does the database part of each delete under a global lock, so parallel requests only overlap round trips and file cleanup.
- Folders come from `GET /api/characters/groups/list` each time the manager opens, because folder changes don't change `catalogGeneration`. Adding or removing characters reads the folder first and then sends its full member list with `PATCH /api/characters/groups/:id`, since that call replaces the list.
- Edit and Chat call Marinara's own UI actions (`openCharacterDetail` and `openModal("start-character-chat")`). Marinara does not publish these to page code, so the extension finds its UI store in React's component tree, where zustand keeps a reference to it. Marinara's query client is found the same way and refreshes Marinara's character lists after an edit. If neither can be found, the extension opens the stock library, searches for the character, and clicks its Edit or Chat now button.

## Install

The extension needs **Full page access**, because the sandboxed runtime can't reach the library's DOM. Full page code runs inside Marinara's page with the same authority as code pasted into the browser console, so read the files in `extension/` before you approve them.

1. Set `ENABLE_EXTERNAL_EXTENSIONS=true` in the Marinara host's `.env` and restart Marinara.
2. Open **Settings** > **Advanced** > **Danger Zone** and enable **Allow third-party extension imports**.
3. Open **Settings** > **Addons** > **External Extensions** and choose **Import Extension Folder**. Select the **`extension`** folder in this repository, not the repository root.
4. Open the draft, check the code, choose **Review and Run**, and approve the hash.

Every code change disables the extension until you review and approve the new hash.

## Limitations

- The fiber lookup depends on Marinara using React and zustand the way it does now. If an update changes that, Edit and Chat fall back to driving the stock library, and Marinara's lists may show old tags until they refetch.
- *All card text* matches each word separately, and Marinara's search treats a word that exactly matches a tag as that tag, so a search word can also match characters that only have it as a tag.

The library tag filters:

- Once a mandatory tag is set, every other word in the search box also counts as a required tag. For example, `alice "elf"` only matches characters tagged both `alice` and `elf`, not characters named Alice. The panel warns when this happens.
- **At least one tag** can only hide cards that are already loaded. Marinara loads the next page on its own while the list is short, and the panel shows how many matching characters exist in total.
- Marinara's own "visible / loaded" count in the library header ignores the **At least one tag** filter.
- Tags that contain `"` can't be made mandatory or excluded, because the search syntax can't quote them.

## Development

`node scripts/serve.mjs` serves a dev harness on http://localhost:5179 with a mock Marinara API and a generated mock library (`dev/mock-library.mjs`), so nothing touches a real Marinara install. `npm test` runs the unit tests, `npm run check` also compiles the extension the way Marinara wraps it, and `npm run smoke` drives the harness in headless Chrome (see the header of `scripts/smoke.mjs`).
