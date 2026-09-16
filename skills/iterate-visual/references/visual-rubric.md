# Visual rubric

Seven yes/no items, seeded from *Storytelling with Data* (Cole Nussbaumer Knaflic). Score a chart by looking at
its rendered PNG, not at its spec: the question each item asks is answerable from the image.

A pass records a verdict and a one-line note for every item. The note names what in the image decides it — a
legend you had to read, a bar whose value you had to estimate, an axis that starts above zero. "Looks fine" is
not a note.

The score is the count of `yes` verdicts. It is advisory: it never substitutes for a Check, an evidence
reference or a review, and a high score on a chart bound to the wrong result set is still the wrong chart.

## The items

### `declutter`

Is every mark, line and label on the chart carrying information? Gridlines, tick marks, borders, background
fills and repeated axis labels are clutter unless the Reader needs them to read a value.

### `one_message`

Does the chart make exactly one point? A chart that supports two Claims is two charts.

### `title_states_claim`

Is the title the Claim, in a sentence, rather than a description of the axes? "Users who saw the checklist came
back more often" is a title; "Retention by arm" is a label.

### `direct_labels`

Are the values the Reader needs written next to the marks they belong to, instead of in a legend or an axis the
Reader has to trace across? In this subset the way to do it is a layered `text` mark bound to a field the chart
already shows; a legend is the fallback, and a fallback is a `no`.

### `grey_plus_accent`

Is everything grey except the one thing the Claim is about? Colour is how the chart points; a palette that
colours every category points at nothing.

### `colorblind_safe`

Do the colours stay distinguishable without hue? Check that the accent differs from the grey in lightness, not
only in hue, and that no pair of red and green carries meaning on its own.

### `axis_not_truncated`

Does the value axis start where the Reader expects — at zero for a count or a share — so the length of a bar is
proportional to the value it shows? A domain that starts above zero exaggerates a difference; if a truncated
axis is genuinely the right choice, that is a caveat for the Claim, not a silent one for the chart.

## Recording a pass

```yaml
pass: 1
items:
  - { id: declutter, verdict: "no", note: "Horizontal gridlines behind two bars; nothing is read off them." }
  - { id: one_message, verdict: "yes", note: "Two bars, one comparison." }
  # ... one entry per item above
score: 1          # the count of yes verdicts, and nothing else
```

`score` is derived, never asserted: a recorded score above the count of `yes` verdicts is a fabricated pass.
