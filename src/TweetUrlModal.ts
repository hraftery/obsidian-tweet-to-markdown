import {App, Modal, Notice, Setting} from 'obsidian'
import {buildMarkdown, getTweet, getTweetID} from './util'
import {createDownloadManager, DownloadManager} from './downloadManager'
import TTM from 'main'
import {TweetCompleteModal} from './TweetCompleteModal'

export class TweetUrlModal extends Modal {
  url = ''
  plugin
  tweetComplete: TweetCompleteModal
  thread = false
  downloadManager: DownloadManager
  constructor(app: App, plugin: TTM, tweetComplete: TweetCompleteModal) {
    super(app)
    this.plugin = plugin
    this.tweetComplete = tweetComplete
  }

  onOpen(): void {
    const {contentEl, titleEl} = this
    titleEl.setText('Download Tweet')

    new Setting(contentEl)
      .setName('Tweet URL')
      .setDesc('Enter the URL of the tweet to download.')
      .addText(input => {
        input
          .setValue(this.url)
          .onChange(value => (this.url = value))
          .setPlaceholder('Tweet URL')
      })

    new Setting(contentEl)
      .setName('Tweet thread')
      .setDesc(
        'Download a tweet thread. (Put the link to the LAST tweet in the thread).'
      )
      .addToggle(toggle => {
        toggle.setValue(false).onChange(value => {
          this.thread = value
        })
      })

    new Setting(contentEl)
      .setClass('download_tweet_button')
      .addButton(button => {
        button.setButtonText('Download Tweet')
        button.onClick(async () => {
          // error checking for kickoff
          const bearerToken =
            process.env.TWITTER_BEARER_TOKEN ||
            this.plugin.settings.bearerToken ||
            ''
          if (!this.url) {
            new Notice('No tweet link provided.')
            return
          }
          let id = ''
          try {
            id = getTweetID(this.url)
          } catch (error) {
            new Notice(error.message)
            return
          }

          if (!bearerToken) {
            new Notice('Bearer token was not found.')
            return
          }

          this.plugin.bearerToken = bearerToken

          this.downloadManager = createDownloadManager()

          // set the button as loading
          button.setButtonText('Loading...')
          button.setDisabled(true)

          // fetch tweet
          try {
            this.plugin.currentTweet = await getTweet(id, bearerToken)
          } catch (error) {
            new Notice(error.message)
            // set the button as loading
            button.setButtonText('Download Tweet')
            button.setDisabled(false)
            return
          }
          this.plugin.currentTweetMarkdown = ''

          // special handling for threads
          if (this.thread) {
            // check if this is the head tweet
            while (
              this.plugin.currentTweet.data.conversation_id !==
              this.plugin.currentTweet.data.id
            ) {
              const markdown = await buildMarkdown(
                this.app,
                this.plugin,
                this.downloadManager,
                this.plugin.currentTweet,
                'thread'
              )
              this.plugin.currentTweetMarkdown =
                markdown + this.plugin.currentTweetMarkdown
              // load in parent tweet
              const [parent_tweet] =
                this.plugin.currentTweet.data.referenced_tweets.filter(
                  ref_tweet => ref_tweet.type === 'replied_to'
                )
              this.plugin.currentTweet = await getTweet(
                parent_tweet.id,
                bearerToken
              )
            }
          }

          const markdown = await buildMarkdown(
            this.app,
            this.plugin,
            this.downloadManager,
            this.plugin.currentTweet
          )
          this.plugin.currentTweetMarkdown =
            markdown + this.plugin.currentTweetMarkdown

          await this.downloadManager
            .finishDownloads()
            .then(results => {
              console.log(results)
              if (results.length) {
                new Notice('Images downloaded.')
              }
            })
            .catch(error => {
              new Notice('There was an error downloading the images.')
              console.error(error)
            })
          this.close()
        })
      })
  }

  onClose(): void {
    const {contentEl, titleEl} = this
    titleEl.empty()
    contentEl.empty()
    if (this.plugin.currentTweetMarkdown) {
      this.tweetComplete.open()
    }
  }
}
