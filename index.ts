import AWS, { CloudWatchLogs, SharedIniFileCredentials, STS } from 'aws-sdk'
import prompts, { PromptObject } from 'prompts'

//デフォルトのプロファイル使う
const credentials = new SharedIniFileCredentials({ profile: 'default' });

AWS.config.credentials = credentials;
AWS.config.region = 'ap-northeast-1';
const CWL = new CloudWatchLogs()


async function listLogGrops(): Promise<{ account: string, logGroups: string[] }> {

    const account = (await new STS().getCallerIdentity().promise()).Account || ''

    const logGroups: string[] = []

    let res = await CWL.describeLogGroups().promise()

    if (!res.logGroups) return { account, logGroups: [] }

    logGroups.push(...res.logGroups.map(l => l.logGroupName ? l.logGroupName : ''))

    while (res.nextToken) {

        res = await CWL.describeLogGroups({ nextToken: res.nextToken }).promise()

        if (!res.logGroups) continue

        logGroups.push(...res.logGroups.map(l => l.logGroupName ? l.logGroupName : ''))

    }

    return { account, logGroups: logGroups.filter(l => l !== '') }

}

listLogGrops().then(async ({ account, logGroups }): Promise<{ answer: string, logGroups: string[] }> => {

    console.log(`アカウント:${account}で${logGroups.length}件のLogGroupが見つかりました。(${logGroups[0]}...)`);

    const questions: PromptObject<string> = {
        message: '保持期間を一括で設定しますか？(y/N) >',
        type: 'text',
        name: "answer",
    }

    const ans = await prompts(questions);

    return { answer: ans.answer, logGroups }

}).then(async ({ answer, logGroups }): Promise<{ retention: number, logGroups: string[] } | null> => {

    if (answer !== 'y') return null

    const questions: PromptObject<string> = {
        message: '保持期間を選択してください',
        type: 'select',
        name: "retention",
        choices: [{ title: '1日', value: 1 },
        { title: '1日', value: 1 },
        { title: '3日', value: 3 },
        { title: '5日', value: 5 },
        { title: '1週間', value: 7 },
        { title: '2週間', value: 14 },
        { title: '1か月(30日)', value: 30 },
        { title: '2か月(60日)', value: 60 },
        { title: '3か月(90日)', value: 90 },
        { title: '4か月(120日)', value: 120 },
        { title: '5か月(150日)', value: 150 },
        { title: '6か月(180日)', value: 180 },
        { title: '1年', value: 365 },
        { title: '400日', value: 400 },
        { title: '1年6か月', value: 545 },
        { title: '2年(731日)', value: 731 },
        { title: '60か月(1827日)', value: 1827 },
        { title: '10年(3653日)', value: 3653 },
        ]

    }

    const ans = await prompts(questions);

    return { retention: ans.retention, logGroups }

}).then(async (data) => {

    if (data === null) return

    const { retention, logGroups } = data

    const sleep = (msec: number) => new Promise(resolve => setTimeout(resolve, msec));

    let i = 0
    while (i < logGroups.length) {

        const logGroup = logGroups[i]

        try {
            await CWL.putRetentionPolicy({ logGroupName: logGroup, retentionInDays: retention }).promise()
        } catch (e) {

            //手抜き(exponential backoffしてない)
            if (e.code === 'ThrottlingException') {
                await sleep(3000)
                continue
            }

            throw e
        }

        i++

    }


    return

}).then(() => {
    console.log('設定が完了しました');
})