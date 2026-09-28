## The goal of this app is to creatte an app for helpping typing 
1. Is a web app, mainly front, no server side
2. Let's use /usr/share/dict/words for the words
3. On the current session keep track of the progress of the person working
4. Goal is to improve typing
5. clean the dictionary from all non alpha chars, set all chars to lowercase
5. Algorithm:
    a) Start with the most commun letters, choose 8 for starting
    b) pull randomly a set of words to type having the best combination of those selected letters
    c) track performance of typing. Define two thresholds SPEED and ACCURACY let them be parameters, start with SPEED = 30 wpm ACCURACY at 95%. No moving to next stage if that thresholds are not meet.
    d) keep pulling the same set of words ( say a dozen ) until user reach the requiered speed and accuracy for a given letter.
    e) once the threshold reached for a letter, choose another letter, the next most commun one.
    f) keep pulling random words from that set.
6. UX:
    a) pull the set of words (they can repeat) say arount 30-40 on top. clearly visible with a cursor moving for indicating next caracter to type
    b) have a look to the screenshoot.
