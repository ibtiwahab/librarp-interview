/**
 * DEVELOPMENT sample content only. Mirrors the formatting of real Libra RP
 * interview documents so the importer and interview flow can be exercised.
 * Never used by the production bootstrap.
 */

export const SAMPLE_EMS_TEXT = `1. What are the primary duties of EMS?
2. How many deputies you can have?
3. Who are they?
4. So what are your plans for EMS?
5. What times are you in city
6. What is Fail RP? Give me one example
7. What is Fear RP? Give me one example
8. What is UB? Give me one example
9. What is Meta Gaming? Give me one example
10. Can your main be in state org and twink can be in gang? Or in LI?
11. Can people commit crimes against EMS?
12. Can people harass EMS while they are on duty?
13. How will you go about if someone is harassing EMS while on duty?
14. How many people illegal orgs need to pull someone over?
15. Can illegal orgs pull you over while you are on duty as EMS?
16. Can you carry weapons while working as EMS?
17. Can you kill someone while you are working as EMS?
18. Can EMS be corrupt?
19. Can you enter gang HQ?
20. Who set internal rules for EMS?
21. Can EMS assist unconscious players during active gun fight?
22. Can EMS be asked to stop performing their for any reason?
23. What happen if you or your deputy break OOC rules?
24. How long you have to hold pov of events?
25. Can you patch someone in Safe Zone?
26. What will you do if you see a member of your staff shooting at citizens while actively on duty?
27. Can you sell medikits to criminals?
28. Can you give adrenaline shots to criminals?`;

export const SAMPLE_FIB_TEXT = `FIB Questions
1- What is the primary role of FIB within the state?
2- Who are your deputies?
3- Have you already setup your HC team and who is going to be in what position?
4- So what are your plans for FIB? (How will you bring activity, RP etc can be follow up questions)
5- What times are you in the city?
6- What is Fail RP and give me one example?
7- What is Fear RP and give me one example?
8- What changes do you believe you can make to FIB that can benefit the city overall?
9- What are some major changes that you would make to FIB that could benefit its functionality?
10- What do you believe makes FIB the second most powerful organization in the city?
11- What is the difference between Car Ramming and Pitting? In what situations can and can you not pit?
12- What is UB? Give me one example
13- What is Meta gaming, give me one example?
14- How many people are needed in an illegal organization to pull someone over?
15- Can your main account be in LEO org and twink can be in Gang or lifeinvader?
16- Can you shoot people on starter jobs?
17- Can you arrest people on starter jobs?
18- Can you arrest a Taxi Driver?
19- Can you arrest EMS who is on duty?
20- After what rank can you start doing corruption?
21- When can you enter gang HQ as a state employee?
22- Can you hire someone with a criminal background?
23- Is there any OOC rule for recording arresting procedures? (if he says yes ask him how many hours you need to hold pov for).
24- Can you use org cars to go and buy something at a flea market? (No org cars can't be used for personal reasons)
25- How much time do you have to arrest someone? (if he says 30 mins ask is there any exception for this)
26- How many org members do you need to enter the ghetto/danger zone?
27- How many corrupt officers can you have?
28- Can you IA members be corrupt?
29- Can you be corrupt? What can happen if you are caught?
30- What happens if you or your deputy break an OOC server rule?
31- Can you change your appearance or name to avoid a case file?
32- Can you stop EMS from doing their job?
33- Can you stall arresting someone or delay someone else's arrest?
34- How will you deal with corrupt officers?
35- Can you use a sniper rifle at a store robbery?
36- Can you shoot someone that is outside the circle of the event? (if he says no ask what if he runs out to run away)
37-  How long do you have to hold the pov of the event?
38- What is the amount of money you need to pay for hostages?
39- Can you use inaccessible roofs with heli?
40- Can you enter a store robbery after dying?
41- How much time you need to give to gangs and gangs need to give you after negotiation to start shooting?
42- If there is no hostage, can you still negotiate with the gang?
43- Let's suppose you are patrolling outside the city and you see a gang robbing someone or your own unit. Can you start shooting at them?
44- Can you shoot someone in a safe zone?
45- Can you arrest someone in a safe zone?
46- Can you enter a safe zone when a gang is chasing you?
47- How are you going to make sure your HC team is up to mark?
48- When can you use armored cars?
49- Can you cuff someone while holding a weapon? (If yes what weapons)
50- Can you interrogate a gang member and use that interrogation in case file?
51- How much evidence do you need to start a gang raid?
52- Can you collect evidence during the Ammo Run?
53- Can you collect evidence during a store robbery?
54- Can you collect evidence during Shipment?
55- Can you collect evidence through drone?`;

/** Generic starter questions for organizations without a real document yet. */
export const GENERIC_LEADERSHIP_QUESTIONS = [
  "Why do you want to lead this organization?",
  "Who will be your deputies, and why did you choose them?",
  "What are your plans for the organization over the next month?",
  "What times are you usually in the city?",
  "What is Fail RP? Give me one example.",
  "What is Fear RP? Give me one example.",
  "What is Meta Gaming? Give me one example.",
  "How will you handle a member who repeatedly breaks server rules?",
];

export const SAMPLE_ADMIN_QUESTIONS: Array<{ questionText: string; followUpPrompts?: string[]; category?: string }> = [
  { questionText: "Why do you want to join the Libra RP administration team?", category: "Motivation" },
  { questionText: "How much time can you dedicate to administration each week?", category: "Availability" },
  { questionText: "Explain the difference between RDM and VDM.", category: "Rules" },
  { questionText: "A player reports being killed without RP. What steps do you take?", followUpPrompts: ["Ask what evidence they would request."], category: "Scenarios" },
  { questionText: "How would you handle a report involving a friend of yours?", category: "Integrity" },
  { questionText: "What would you do if another admin abused their powers?", category: "Integrity" },
  { questionText: "When is it appropriate to spectate a player?", category: "Tools" },
  { questionText: "How do you stay calm with a hostile player in a ticket?", category: "Conduct" },
];
