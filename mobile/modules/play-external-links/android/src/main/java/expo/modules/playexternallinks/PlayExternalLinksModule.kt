package expo.modules.playexternallinks

import android.net.Uri
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingProgramReportingDetailsParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.EnableBillingProgramParams
import com.android.billingclient.api.LaunchExternalLinkParams
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Google Play external content links (US): eligibility check, single-use reporting token,
 * and Google's "leaving Google Play" notice before the app opens Stripe checkout itself.
 */
class PlayExternalLinksModule : Module() {
  private var client: BillingClient? = null

  private fun result(code: Int, message: String?, token: String? = null): Map<String, Any?> =
    mapOf("code" to code, "message" to (message ?: ""), "token" to token)

  private fun withClient(promise: Promise, block: (BillingClient) -> Unit) {
    val existing = client
    if (existing != null && existing.isReady) {
      block(existing)
      return
    }
    val context = appContext.reactContext
    if (context == null) {
      promise.resolve(result(BillingClient.BillingResponseCode.DEVELOPER_ERROR, "No Android context"))
      return
    }
    val fresh = BillingClient.newBuilder(context)
      .enableBillingProgram(
        EnableBillingProgramParams.newBuilder()
          .setBillingProgram(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK)
          .build()
      )
      .build()
    client = fresh
    var settled = false
    fresh.startConnection(object : BillingClientStateListener {
      override fun onBillingSetupFinished(billingResult: BillingResult) {
        if (settled) return
        settled = true
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
          block(fresh)
        } else {
          client = null
          promise.resolve(result(billingResult.responseCode, billingResult.debugMessage))
        }
      }

      override fun onBillingServiceDisconnected() {
        client = null
        if (settled) return
        settled = true
        promise.resolve(result(BillingClient.BillingResponseCode.SERVICE_DISCONNECTED, "Disconnected from Google Play"))
      }
    })
  }

  override fun definition() = ModuleDefinition {
    Name("PlayExternalLinks")

    AsyncFunction("checkAvailability") { promise: Promise ->
      withClient(promise) { billing ->
        billing.isBillingProgramAvailableAsync(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK) { billingResult, _ ->
          promise.resolve(result(billingResult.responseCode, billingResult.debugMessage))
        }
      }
    }

    AsyncFunction("createToken") { promise: Promise ->
      withClient(promise) { billing ->
        val params = BillingProgramReportingDetailsParams.newBuilder()
          .setBillingProgram(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK)
          .build()
        billing.createBillingProgramReportingDetailsAsync(params) { billingResult, details ->
          promise.resolve(result(billingResult.responseCode, billingResult.debugMessage, details?.externalTransactionToken))
        }
      }
    }

    AsyncFunction("showNotice") { url: String, token: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(result(BillingClient.BillingResponseCode.DEVELOPER_ERROR, "No activity"))
        return@AsyncFunction
      }
      withClient(promise) { billing ->
        val params = LaunchExternalLinkParams.newBuilder()
          .setBillingProgram(BillingClient.BillingProgram.EXTERNAL_CONTENT_LINK)
          .setLinkUri(Uri.parse(url))
          .setExternalTransactionToken(token)
          .setLinkType(LaunchExternalLinkParams.LinkType.LINK_TO_DIGITAL_CONTENT_OFFER)
          .setLaunchMode(LaunchExternalLinkParams.LaunchMode.CALLER_WILL_LAUNCH_LINK)
          .build()
        billing.launchExternalLink(activity, params) { billingResult ->
          promise.resolve(result(billingResult.responseCode, billingResult.debugMessage))
        }
      }
    }.runOnQueue(Queues.MAIN)

    OnDestroy {
      client?.endConnection()
      client = null
    }
  }
}
