import React from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const GLOSSARY = {
  save100: 'Extra profit on a $100 stake vs. the median book price.',
  edge: "The best available price's expected value vs. the de-vigged consensus (fair) odds — positive means the bet is +EV.",
  ev: 'Expected value of the best available price vs. the fair (de-vigged) odds for this line.',
  l10: "How many of the player's recent games cleared this line. The window is per sport — 10 for basketball and football, 15 for baseball — and never reaches back into a previous season, so it can be shorter early in a year or for a player who missed time.",
  vig: "The sportsbook's built-in margin — the amount implied probabilities on both sides exceed 100%.",
  roi: 'Return on investment: profit divided by total staked, treating every settled bet as $100. Note a 50% win rate at -110 returns about -4.5%, because that is the vig.',
  clv: 'Closing-line value: whether the price we flagged beat where the market closed. Beating the close is the standard evidence an edge was real rather than lucky, since it shows immediately instead of needing hundreds of settled bets.',
};

export function Term({ define, children }) {
  const definition = GLOSSARY[define];
  if (!definition) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help border-b border-dotted border-slate-600">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="bg-popover text-popover-foreground border border-border">
        {definition}
      </TooltipContent>
    </Tooltip>
  );
}

export default Term;
