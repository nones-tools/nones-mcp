import type { CliCommand } from '../../interfaces';
import type { Card } from '../../kaiten';
import { optimizeCardMinimalList } from '../projections';

export const tagCommand: CliCommand = {
  name: 'tag',
  async run(argv, { getSdk }) {
    const sdk = getSdk();
    const tagCmd = argv[1];
    if (tagCmd === 'add') {
      const tagCardId = argv[2];
      const tagName = argv[3];
      const taggedCard = await sdk.addTag(Number(tagCardId), tagName as string);
      console.log(JSON.stringify(taggedCard, null, 2));
    } else if (tagCmd === 'remove') {
      const tagCardId = argv[2];
      const tagName = argv[3];
      const untaggedCard = await sdk.removeTag(Number(tagCardId), tagName as string);
      console.log(JSON.stringify(untaggedCard, null, 2));
    } else if (tagCmd === 'list') {
      const cards = (await sdk.getCards()) as Card[];
      cards.forEach((card) => {
        const tags = sdk.getTags(card);
        if (tags.length > 0) {
          console.log(`[${card.id}] ${card.title}: ${tags.join(', ')}`);
        }
      });
    } else if (tagCmd === 'filter') {
      const tagName = argv[2];
      const filteredCards = await sdk.getCardsWithTag(tagName as string);
      const useMinimal = argv.includes('--minimal') || argv.includes('-m');
      if (useMinimal) {
        console.log(JSON.stringify(optimizeCardMinimalList(filteredCards), null, 0));
      } else {
        console.log(
          JSON.stringify(
            filteredCards.map((c) => ({
              id: c.id,
              title: c.title,
              tags: sdk.getTags(c),
            })),
            null,
            2
          )
        );
      }
    }
  },
};

export const findCommand: CliCommand = {
  name: 'find',
  async run(argv, { getSdk }) {
    const sdk = getSdk();
    const findTag = argv[1];
    const boardFilter = argv.find((arg) => arg.startsWith('--board='));
    if (findTag) {
      let foundCards: Card[];
      if (boardFilter) {
        const boardValue = boardFilter.split('=')[1] as string;
        let boardId: number;
        if (!Number.isNaN(Number(boardValue))) {
          boardId = parseInt(boardValue, 10);
        } else {
          boardId = await sdk.getBoardId(sdk.config.defaultSpaceId as number, boardValue);
        }
        foundCards = (await sdk.getCards(null, boardId)) as Card[];
        foundCards = foundCards.filter((card) => {
          const cardTags = card.tags?.map((t) => t.name) || [];
          return cardTags.includes(findTag);
        });
      } else {
        foundCards = await sdk.getCardsWithTag(findTag);
      }
      const useMinimalFind = argv.includes('--minimal') || argv.includes('-m');
      if (useMinimalFind) {
        console.log(JSON.stringify(optimizeCardMinimalList(foundCards), null, 0));
      } else {
        foundCards.forEach((c) => {
          console.log(`[${c.id}] ${c.title}`);
        });
      }
    }
  },
};
