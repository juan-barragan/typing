## The goal of this app is to creatte an app for helpping typing 
1. Is a web app, mainly front, no server side
2. Lets use /usr/share/dict/words for the words
3. On the current session keep track of the progress of the person working
4. Goal is to improve tipying
5. clean the disctionnary from all non alpha chars all lowercases
5. Algorithm:
    a) Start with the most commun letters, choose 8 for starting
    b) pull randomly a set of words to type having the best combination of those selected letters
    c) track performance of typing define two thesholds SPEED and ACCURACY let them be parameters
    d) kepp pulling the same set of words ( say a dozen ) until user reach the requiered speed and accuracy for a given letter
    e) once the threshold reached for a letter, choose another letter, the next most commun
    f) keep pulling random words from that set whit the new letters
6. UX:
    a) pull the set of words (they can repeat) say arount 30-40 on top. clearly visible with a cursor moving for indicating next caracter to type
    b) have a loot to the screenshoot 