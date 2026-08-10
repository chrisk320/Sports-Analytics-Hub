import React from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

const GLOSSARY = {
  save100: 'Extra profit on a $100 stake vs. the median book price.',
  edge: "The best available price's expected value vs. the de-vigged consensus (fair) odds — positive means the bet is +EV.",
  ev: 'Expected value of the best available price vs. the fair (de-vigged) odds for this line.',
  l10: "How many of the player's last 10 games cleared this line.",
  vig: "The sportsbook's built-in margin — the amount implied probabilities on both sides exceed 100%.",
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
