let axios=require("axios");
let jsdom=require("jsdom");
let excel=require("excel4node");
let path=require("path");
let pdf=require("pdf-lib");
let fs=require("fs");
const { fstat } = require("fs");

let args=process.argv.slice(2);

let dwnldPromise=axios.get(args[0]);
dwnldPromise.then(function(response){
    let html=response.data;
    
    let dom=new jsdom.JSDOM(html);
    let document=dom.window.document;

    let matches = [];
    let matchDivs= document.querySelectorAll("div.match-score-block");
    for(let i=0;i<matchDivs.length;i++)
    {
        let matchDiv=matchDivs[i];
        let match={
            t1:"",
            t2:"",
            t1S:"",
            t2S:"",
            result:""
        }
        let teamParas= matchDiv.querySelectorAll("div.name-detail > p.name");
        match.t1=teamParas[0].textContent;
        match.t2=teamParas[1].textContent;

        let scoreSpans=matchDiv.querySelectorAll("div.score-detail > span.score")
        if(scoreSpans.length==2)
        {
            match.t1S=scoreSpans[0].textContent;
            match.t2S=scoreSpans[1].textContent;
        }
        else if(scoreSpans.length==1)
        {
            match.t1S=scoreSpans[0].textContent;
            match.t2S=" ";
        }
        else{
            match.t1S=" ";
            match.t2S=" ";
        }

        let resultSpan=matchDiv.querySelector("div.status-text > span");
        match.result=resultSpan.textContent;

        matches.push(match);
    }
  //  console.log(matches);
  let matchesJSON=JSON.stringify(matches);
  fs.writeFileSync("matches.json",matchesJSON,"utf-8");
    let teams=[];
    for(let i=0;i<matches.length;i++)
    {
        putTeamInTeamsArrayIfMissing(teams,matches[i]);
    }

    for(let i=0;i<matches.length;i++)
    {
        putMatchInAppropriateTeam(teams,matches[i]);
    }
   // console.log(teams);
   let teamsJSON=JSON.stringify(teams);
   fs.writeFileSync("teams.json",teamsJSON,"utf-8");

   createExcelFile(teams);
   createFolder(teams);
}).catch(function(err){
    console.log(err);
});

function putTeamInTeamsArrayIfMissing(teams,match)
{
    let t1Idx=-1;
    for(let i=0;i<teams.length;i++)
    {
        if(teams[i].name==match.t1)
        {
            t1Idx=i;
            break;
        }
    }
    if(t1Idx==-1)
    {
        teams.push({
            name:match.t1,
            matches:[]
        });
    }
    
    let t2Idx=-1;
    for(let i=0;i<teams.length;i++)
    {
        if(teams[i].name==match.t2)
        {
            t2Idx=i;
            break;
        }
    } 
    if(t2Idx==-1)
    {
        teams.push({
            name:match.t2,
            matches:[]
        });
    }
}

function putMatchInAppropriateTeam(teams,match)
{
    let t1Idx=-1;
    for(let i=0;i<teams.length;i++)
    {
        if(teams[i].name==match.t1)
        {
            t1Idx=i;
            break;
        }
    }
    let team1=teams[t1Idx];
    team1.matches.push({
        vs:match.t2,
        selfscore: match.t1S,
        oppscore:match.t2S,
        result:match.result
    });

    let t2Idx=-1;
    for(let i=0;i<teams.length;i++)
    {
        if(teams[i].name==match.t2)
        {
            t2Idx=i;
            break;
        }
    }
    let team2=teams[t2Idx];
    team2.matches.push({
        vs:match.t1,
        selfscore:match.t2S,
        oppscore:match.t1S,
        result:match.result
    });
}

function createExcelFile(teams)
{
    let wb=new excel.Workbook();
    for(let i=0;i<teams.length;i++)
    {
        let sheet = wb.addWorksheet(teams[i].name);
        sheet.cell(1,1).string("Vs");
        sheet.cell(1,2).string("Self-Score");
        sheet.cell(1,3).string("Opp-Score");
        sheet.cell(1,4).string("Result");
        
        for(let j=0;j<teams[i].matches.length;j++)
        {
            sheet.cell(j+2,1).string(teams[i].matches[j].vs);
            sheet.cell(j+2,2).string(teams[i].matches[j].selfscore);
            sheet.cell(j+2,3).string(teams[i].matches[j].oppscore);
            sheet.cell(j+2,4).string(teams[i].matches[j].result);
        }
    }
    wb.write("Worldcup.CSV");
}

function createFolder(teams)
{
    fs.mkdirSync("DataFolder");
    for(let i=0;i<teams.length;i++)
    {
        let teamFN=path.join("DataFolder",teams[i].name);
        fs.mkdirSync(teamFN);
        for(let j=0;j<teams[i].matches.length;j++)
        {
            let matchFileName=path.join(teamFN,teams[i].matches[j].vs+".pdf");
            createScoreCard(teams[i].name,teams[i].matches[j],matchFileName);
        }
    }
}

function createScoreCard(teamName,match,matchFileName)
{
    let t1=teamName;
    let t2=match.vs;
    let t1S=match.selfscore;
    let t2S=match.oppscore;
    let result=match.result;

    let originalBytes=fs.readFileSync("Template.pdf");
    let prmToLoad=pdf.PDFDocument.load(originalBytes);
    prmToLoad.then(function(pdfDoc){
        let page = pdfDoc.getPage(0);

        page.drawText(t1, {
            x: 320,
            y: 709,
            size: 8
        });
        page.drawText(t2, {
            x: 320,
            y: 695,
            size: 8
        });
        page.drawText(t1S, {
            x: 320,
            y: 681,
            size: 8
        });
        page.drawText(t2S, {
            x: 320,
            y: 667,
            size: 8
        });
        page.drawText(result, {
            x: 320,
            y: 653,
            size: 8
        });
        
        let prmToSave=pdfDoc.save();
        prmToSave.then(function(changedBytes){
            if(fs.existsSync(matchFileName+".pdf"))
            {
                fs.writeFileSync(matchFileName+"1.pdf",changedBytes);
            }
            else
            {
                fs.writeFileSync(matchFileName+".pdf",changedBytes);
            }
        }) 
    });    
}
//console.log(matches);
// Runtime Command: node cricInfoExtractor.js "https://www.espncricinfo.com/series/icc-cricket-world-cup-2019-1144415/match-results"