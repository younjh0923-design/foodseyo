export interface NearbyRestaurant {
  id: string;
  name: string;
  cuisine: string;
  distance: string;
  location: string;
  priceLevel: "$" | "$$" | "$$$";
  analyzed: boolean;
}

export const demoNearbyRestaurants: NearbyRestaurant[] = [
  {
    id: "pai-northern-thai-kitchen",
    name: "PAI Northern Thai Kitchen",
    cuisine: "Northern Thai",
    distance: "320 m",
    location: "Toronto",
    priceLevel: "$$",
    analyzed: true,
  },
  {
    id: "khao-san-road",
    name: "Khao San Road",
    cuisine: "Thai",
    distance: "540 m",
    location: "Toronto",
    priceLevel: "$$",
    analyzed: false,
  },
  {
    id: "mamakas-taverna",
    name: "Mamakas Taverna",
    cuisine: "Greek",
    distance: "1.2 km",
    location: "Toronto",
    priceLevel: "$$$",
    analyzed: false,
  },
  {
    id: "seven-lives",
    name: "Seven Lives",
    cuisine: "Mexican seafood",
    distance: "1.8 km",
    location: "Toronto",
    priceLevel: "$",
    analyzed: false,
  },
];
