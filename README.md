# 🕹️ Spaceship IDE

Steer your ideas in realtime, spaceship pilot style!

![Screencast](./extra/screencast.gif)

## Conjecture

> In the near future, LLM and Decision Models will reach 60 FPS interactivity.

When that happens, what new interaction paradigms will unlock? This project demonstrates plausible and desirable interactions for that future.

1. **Focus monitor**: can we visualize what LLM is paying attention to, and use that to guide human's focus towards what's important?
2. **Attention lock**: can we force LLM to pay more attention to specific phrases so as to bias its future behavior?
3. **Future Vector Steering**: can we decompose the task into eigenvectors and independently tune each to control steer the text generation?
4. **Realtime re-generation**: when text generation is cheap and fast, can we explore alternative futures by scrubbing?

## Design process

I used Claude Code for most of the implementation but stayed hands-on for the UI/UX. I iterate using interactive style swatch, a technique where I prompt AI to give me diverse options of designs, I provide feedback, and it iterates. You can see the design artifacts in the [extra page](https://chuanqisun.github.io/spaceship/extra/style-1.html).

To achieve the realtime experience, I have to use agreesive speculative generation and manage cache invalidation based on user interactions. For example, when the main knob moves backward, I have to empty future texts and cancel ongoing requests. There are many considerations like this throughout the system and that took a lot of human judgement - claude didn't one shot them.

## Theory

I'm currently focusing on systems that help human shape ideas in realtime. This project is a small step towards my [upcoming thesis](https://code.chuanqisun.com/master-thesis/) at the MIT Media Lab, where I investigate how semantic and symoblic systems can be coupled to enhance human creativity, agency, and joy of craft.
