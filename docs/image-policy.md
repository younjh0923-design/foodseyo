# Foodseyo Image Policy

**Status:** Frozen for T2.1

**Date:** 2026-07-15

This policy governs dish presentation images shown in Foodseyo. It does not restrict GPT-5.6 analysis of user-provided menu, restaurant, or screen images. Image understanding remains part of the competition P0; generating replacement dish photography with AI does not.

## MVP rule

Foodseyo MVP does not use AI-generated dish images.

Reasons:

- an AI-generated image may be mistaken for the restaurant’s actual dish;
- image generation adds API cost and latency;
- generating images for many menu items adds unnecessary complexity;
- generated presentation may differ from the real food;
- Foodseyo’s core value is food understanding and ordering support, not image generation.

Missing imagery must never block menu explanation, analysis, or ordering guidance.

The current persistent Restaurant and Dish UI displays only images with `rightsStatus: cleared` and a valid URL or local asset path. Images marked `attribution_required` remain hidden until the product can visibly render their attribution. Images with `unknown`, `session_only`, or `not_reusable` rights are not public Dish Card assets.

## Image priority

Choose a dish image in this order:

1. A dish image contained in a user-uploaded menu or restaurant screen.
2. An image clearly connected to the dish on the restaurant’s official menu.
3. An image clearly connected to the dish on the restaurant’s official website.
4. An image clearly connected to the dish on a confirmed official restaurant social account.
5. A general dish reference with clear provenance and usage rights.
6. An accessible **Image unavailable** or food-category placeholder.

Foodseyo is not required to show an image for every menu item. If no trustworthy image is available, use a placeholder rather than a misleading image.

## Source honesty

Dish images must preserve source honesty. Image source classification uses:

### Restaurant-specific images

- `uploaded_menu`
- `user_provided_screen`
- `official_menu`
- `official_website`
- `official_social`

### Reference images

- `general_reference`

### Other

- `demo_data`
- `unavailable`

The MVP image source categories do not include `ai_generated`.

An image may be treated as restaurant-specific only when the evidence clearly connects the image to both the confirmed restaurant and the dish. A visually similar dish is not sufficient.

### Images inside user-provided third-party screens

A food photo visible inside a user-uploaded Google Maps, Yelp, search-result, or other third-party screen may be used as evidence during the current analysis session. It must use `user_provided_screen` provenance.

Until the original source and reuse rights are separately verified, Foodseyo must not extract, permanently store, or redistribute that image as a public Dish Card image. Its rights status is `session_only` or `not_reusable`. An official website or official social source also does not automatically make an image rights-cleared; provenance and permission are separate facts.

An image with `attribution_required` rights must retain non-empty attribution metadata, but the current UI does not yet render that attribution and therefore must not display the image. An image with `unknown` rights must remain hidden until its reuse rights are verified. Neither status may be automatically promoted to `cleared` because a source appears official.

## Future shared image metadata

The T3 data contract should be able to represent the following metadata without changing the decisions in this policy:

- image URL or local asset path;
- image source type;
- source page URL, when available;
- whether the image is restaurant-specific;
- user-facing source label;
- attribution, when required;
- limitation;
- image-unavailable state.

T2.1 documents these requirements only. It does not implement TypeScript types or schemas.

## User-facing labels

Approved examples are:

- **From uploaded menu**
- **From restaurant screen**
- **Official restaurant image**
- **Official menu image**
- **Official social image**
- **General dish reference**
- **Demo reference image**
- **Image unavailable**

A **General dish reference** must also display:

> Actual presentation may differ.

A general reference must never be labeled:

- **At this restaurant**
- **Official restaurant image**
- **Restaurant dish photo**
- **Served here**

## General reference requirements

A general dish reference may be used only when all conditions are met:

- the connection to the named dish is clear;
- the original source page can be verified;
- usage rights or the license are clear;
- required attribution can be provided;
- the image cannot reasonably be mistaken for the confirmed restaurant’s actual dish;
- the original source remains traceable.

Do not use:

- search-result images with no verified source;
- images copied from a search-result thumbnail alone;
- images with unclear copyright or permission;
- another restaurant’s image presented as the current restaurant’s dish;
- images with an unclear connection to the dish name;
- image URLs whose origin or stability cannot be verified.

If an appropriate reference cannot be secured, use a placeholder.

## OpenAI web search boundary

OpenAI web search may help find:

- an official restaurant website;
- an official menu page;
- an official page containing a dish image;
- an image’s original source page;
- provenance information for a possible general reference.

A search result is only a source candidate. Its appearance in search does not grant Foodseyo permission to use it. Before an image is used, verify:

- the original source;
- usage rights or license;
- attribution requirements;
- accurate connection to the dish;
- whether the image is restaurant-specific.

## Missing-image behavior

Missing imagery is not an analysis failure. Restaurant Overview and Dish Detail must still be able to show:

- dish name and description;
- price when known;
- taste, texture, spice, and ingredients;
- regional background;
- review evidence;
- Dietary information;
- ordering recommendations.

An accessible placeholder may use:

- a food-category icon;
- a neutral food illustration;
- the text label **Image unavailable**.

A placeholder must not look like a photograph of the actual dish. It must retain an accessible text alternative or label.

## Community Dish Photos & Reviews roadmap

**Community Dish Photos & Reviews** is a post-submission feature, not competition P0.

Future users may contribute content connected to a specific restaurant and dish:

- real dish photos;
- short menu reviews;
- taste and texture opinions;
- perceived spice level;
- visit or order date.

Community images may help when official photography is unavailable, but they do not permanently guarantee current presentation. Approved future labels include:

- **Community photo**
- **Uploaded on [date]**
- **Recently uploaded**
- **Actual presentation may vary**

Implementation requires:

- user accounts and image storage;
- uploader consent;
- restaurant and dish association;
- upload and visit/order dates;
- reporting;
- uploader deletion and deletion requests;
- inappropriate-content moderation;
- handling images that contain personal information;
- correction of incorrectly linked menu items;
- duplicate-image management;
- stale-photo indicators;
- restaurant objection or takedown procedures;
- clear separation between official and community images.

The following are outside the current competition P0:

- user photo uploads;
- public user review creation;
- user accounts;
- database and image storage;
- moderation systems.

## Validation checklist

Before a dish image is displayed, confirm:

- its source type and user-facing label are accurate;
- restaurant-specific status is supported by evidence;
- its rights status is `cleared` and a valid source path exists;
- attribution-required images remain hidden until attribution is visibly rendered;
- unknown rights are verified rather than assumed from an official source;
- a general reference includes its limitation;
- an unavailable image degrades to an honest, accessible placeholder;
- no AI-generated dish image is used.
