import { Move, MoveActionRoll } from "@datasworn/core";
import {
  stringifyYaml,
  type App,
  type Editor,
  type FuzzyMatch,
  type MarkdownView,
} from "obsidian";
import { IronswornCharacterMetadata } from "../character";
import { type CharacterTracker } from "../character-tracker";
import { type Datastore } from "../datastore";
import { randomInt } from "../utils/dice";
import { CustomSuggestModal } from "../utils/suggest";
import { checkForMomentumBurn } from "./action-modal";
import {
  type ActionMoveDescription,
  type MoveDescription,
  type ProgressMoveDescription,
} from "./desc";
import { ActionMoveWrapper } from "./wrapper";

enum MoveKind {
  Progress = "Progress",
  Action = "Action",
  Other = "Other",
}

// interface BaseMoveSpecifier {
//   move: Move;
//   kind: MoveKind;
// }

// interface ProgressMoveSpecifier extends BaseMoveSpecifier {
//   kind: MoveKind.Progress;
//   progressTrack: string;
// }

// interface ActionMoveSpecifier extends BaseMoveSpecifier {
//   kind: MoveKind.Action;
//   stat: string;
// }

function getMoveKind(move: Move): MoveKind {
  switch (move.roll_type) {
    case "action_roll":
      return MoveKind.Action;
    case "progress_roll":
      return MoveKind.Progress;
    case "special_track":
    case "no_roll":
      return MoveKind.Other;
    default:
      throw new Error(
        `unexpected roll type ${(move as Move).roll_type} on move id ${
          (move as Move).id
        }`,
      );
  }
}
const promptForMove = async (app: App, moves: Move[]): Promise<Move> =>
  await CustomSuggestModal.select(
    app,
    moves,
    (move) => move.name,
    ({ item: move, match }: FuzzyMatch<Move>, el: HTMLElement) => {
      const moveKind = getMoveKind(move);
      el.createEl("small", {
        text: `(${moveKind}) ${move.trigger.text}`,
        cls: "forged-suggest-hint",
      });
    },
  );

function processActionMove(
  move: Move,
  stat: string,
  statVal: number,
  adds: number,
): ActionMoveDescription {
  return {
    name: move.name,
    action: randomInt(1, 6),
    stat,
    statVal,
    adds,
    challenge1: randomInt(1, 10),
    challenge2: randomInt(1, 10),
  };
}

function processProgressMove(
  move: Move,
  track: string,
): ProgressMoveDescription {
  return {
    name: move.name,
    progressTrack: track,
    // todo: fetch val
    progressTicks: randomInt(1, 40),
    challenge1: randomInt(1, 10),
    challenge2: randomInt(1, 10),
  };
}

function moveTemplate(move: MoveDescription): string {
  return `\`\`\`move\n${stringifyYaml(move)}\n\`\`\`\n\n`;
}

export function validAdds(baseStat: number): number[] {
  const adds = [];
  for (let add = 0; 1 + baseStat + add <= 10; add++) {
    adds.push(add);
  }
  return adds;
}

export async function runMoveCommand(
  app: App,
  datastore: Datastore,
  tracker: CharacterTracker,
  editor: Editor,
  view: MarkdownView,
): Promise<void> {
  if (view.file?.path == null) {
    console.error("No file for view. Why?");
    return;
  }

  const characters = tracker.characters;
  if (characters.size === 0) {
    console.error("No characters found");
    return;
  }
  const [[characterPath, rawCharacter]] = characters.entries();

  const character = rawCharacter.as(IronswornCharacterMetadata);

  const allMoves = datastore.moves.concat(character.moves);

  const move = await promptForMove(
    app,
    allMoves.sort((a, b) => a.name.localeCompare(b.name)),
  );
  const moveKind = getMoveKind(move);
  if (moveKind === MoveKind.Action) {
    const measures = character.measures;
    const stat = await CustomSuggestModal.select(
      app,
      measures.entries(),
      (m) => `${m.definition.label}: ${m.value ?? "missing (defaults to 0)"}`,
    );

    const adds = await CustomSuggestModal.select(
      app,
      validAdds(stat.value ?? 0),
      (n) => n.toString(10),
    );
    let description = processActionMove(move, stat.key, stat.value ?? 0, adds);
    const wrapper = new ActionMoveWrapper(description);
    description = await checkForMomentumBurn(
      app,
      move as MoveActionRoll,
      wrapper,
      character,
    );
    if (description.burn) {
      await tracker.updateCharacter(
        characterPath,
        IronswornCharacterMetadata,
        (character) => {
          return character.measures.set("momentum", character.momentumReset);
        },
      );
    }
    editor.replaceSelection(moveTemplate(description));
  } else if (moveKind === MoveKind.Progress) {
    const progressTrack = await CustomSuggestModal.select(
      app,
      ["do something", "a real great vow"],
      (text) => text,
    );
    const description = processProgressMove(move, progressTrack);
    editor.replaceSelection(moveTemplate(description));
  }
}