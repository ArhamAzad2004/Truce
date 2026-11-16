// Sample data used when MOTN_API_KEY is not set (local dev, tests, CI). Hand-written, not copied from the API.
import { LIMITS } from "../shared/limits";
import type { Favourite } from "../shared/protocol";
import type { Countries, Source } from "./motn";

const S = (id: string, name: string) => ({ id, name });
const netflix = S("netflix", "Netflix"), prime = S("prime", "Prime Video"), apple = S("apple", "Apple TV"),
  disney = S("disney", "Disney+"), mubi = S("mubi", "Mubi"), hulu = S("hulu", "Hulu"), max = S("hbo", "Max"),
  zee5 = S("zee5", "Zee5"), hotstar = S("hotstar", "JioHotstar"), iplayer = S("iplayer", "BBC iPlayer");

const COUNTRIES: Countries = {
  AE: { name: "United Arab Emirates", services: [netflix, prime, apple, mubi, zee5] },
  GB: { name: "United Kingdom", services: [netflix, prime, disney, apple, iplayer, mubi] },
  IN: { name: "India", services: [netflix, prime, hotstar, apple, zee5, mubi] },
  US: { name: "United States", services: [netflix, prime, disney, max, hulu, apple, mubi] },
};

const F = (id: string, title: string, year: number, genres: string, director: string, cast: string): Favourite =>
  ({ id, title, year, poster: null, genres: genres.split(" "), directors: [director], cast: cast.split(", ") });

const FILMS = [
  F("fx1", "The Godfather", 1972, "crime drama", "Francis Ford Coppola", "Marlon Brando, Al Pacino, James Caan"),
  F("fx2", "The Godfather Part II", 1974, "crime drama", "Francis Ford Coppola", "Al Pacino, Robert De Niro"),
  F("fx3", "Paddington 2", 2017, "family comedy adventure", "Paul King", "Ben Whishaw, Hugh Grant, Sally Hawkins"),
  F("fx4", "Spirited Away", 2001, "animation family fantasy", "Hayao Miyazaki", "Rumi Hiiragi, Miyu Irino"),
  F("fx5", "My Neighbor Totoro", 1988, "animation family fantasy", "Hayao Miyazaki", "Noriko Hidaka, Chika Sakamoto"),
  F("fx6", "Inception", 2010, "scifi action thriller", "Christopher Nolan", "Leonardo DiCaprio, Elliot Page, Tom Hardy"),
  F("fx7", "Interstellar", 2014, "scifi drama adventure", "Christopher Nolan", "Matthew McConaughey, Anne Hathaway"),
  F("fx8", "The Dark Knight", 2008, "action crime thriller", "Christopher Nolan", "Christian Bale, Heath Ledger"),
  F("fx9", "Parasite", 2019, "thriller drama comedy", "Bong Joon-ho", "Song Kang-ho, Choi Woo-shik, Park So-dam"),
  F("fx10", "Knives Out", 2019, "mystery comedy crime", "Rian Johnson", "Daniel Craig, Ana de Armas, Chris Evans"),
  F("fx11", "The Grand Budapest Hotel", 2014, "comedy adventure", "Wes Anderson", "Ralph Fiennes, Tony Revolori"),
  F("fx12", "Mad Max: Fury Road", 2015, "action adventure scifi", "George Miller", "Tom Hardy, Charlize Theron"),
  F("fx13", "Get Out", 2017, "horror thriller mystery", "Jordan Peele", "Daniel Kaluuya, Allison Williams"),
  F("fx14", "La La Land", 2016, "romance music drama", "Damien Chazelle", "Emma Stone, Ryan Gosling"),
  F("fx15", "Whiplash", 2014, "drama music", "Damien Chazelle", "Miles Teller, J.K. Simmons"),
  F("fx16", "The Princess Bride", 1987, "adventure family romance", "Rob Reiner", "Cary Elwes, Robin Wright"),
  F("fx17", "When Harry Met Sally", 1989, "romance comedy", "Rob Reiner", "Billy Crystal, Meg Ryan"),
  F("fx18", "Arrival", 2016, "scifi drama mystery", "Denis Villeneuve", "Amy Adams, Jeremy Renner"),
  F("fx19", "Dune", 2021, "scifi adventure drama", "Denis Villeneuve", "Timothée Chalamet, Zendaya, Rebecca Ferguson"),
  F("fx20", "Blade Runner 2049", 2017, "scifi thriller mystery", "Denis Villeneuve", "Ryan Gosling, Harrison Ford"),
  F("fx21", "Hot Fuzz", 2007, "comedy action crime", "Edgar Wright", "Simon Pegg, Nick Frost"),
  F("fx22", "Shaun of the Dead", 2004, "comedy horror", "Edgar Wright", "Simon Pegg, Nick Frost"),
  F("fx23", "3 Idiots", 2009, "comedy drama", "Rajkumar Hirani", "Aamir Khan, R. Madhavan, Sharman Joshi"),
  F("fx24", "Dangal", 2016, "drama family", "Nitesh Tiwari", "Aamir Khan, Fatima Sana Shaikh"),
  F("fx25", "The Shawshank Redemption", 1994, "drama crime", "Frank Darabont", "Tim Robbins, Morgan Freeman"),
  F("fx26", "Pulp Fiction", 1994, "crime thriller comedy", "Quentin Tarantino", "John Travolta, Uma Thurman, Samuel L. Jackson"),
  F("fx27", "Toy Story", 1995, "animation family comedy", "John Lasseter", "Tom Hanks, Tim Allen"),
  F("fx28", "Coco", 2017, "animation family music", "Lee Unkrich", "Anthony Gonzalez, Gael García Bernal"),
  F("fx29", "Everything Everywhere All at Once", 2022, "scifi comedy action", "Daniel Kwan", "Michelle Yeoh, Ke Huy Quan"),
  F("fx30", "The Social Network", 2010, "drama", "David Fincher", "Jesse Eisenberg, Andrew Garfield"),
  F("fx31", "Gone Girl", 2014, "thriller mystery drama", "David Fincher", "Ben Affleck, Rosamund Pike"),
  F("fx32", "Before Sunrise", 1995, "romance drama", "Richard Linklater", "Ethan Hawke, Julie Delpy"),
];

export const fixtures: Source = {
  countries: async () => COUNTRIES,
  search: async (query) => FILMS.filter((f) => f.title.toLowerCase().includes(query)).slice(0, LIMITS.searchResults),
};
